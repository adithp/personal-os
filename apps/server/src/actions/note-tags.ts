import { entityTags, notes, tags } from '@personal-os/db';
import { markdownToPlainText, parseTags, rewriteTag } from '@personal-os/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UserScope } from '../lib/user-scope';
import { TAG_NAME_INDEX, findOrCreateTag, isUniqueViolation } from './tags';

/**
 * Tags written inside notes (research memo notes.md D10). The tags of a note always equal the
 * `#tags` parsed from its text; they change only through the text. notes.ts calls
 * rebuildNoteTags inside its own save (under the user's 'notes' queue); rename and merge of a tag
 * call rewriteNotesTag.
 */

const BATCH = 500;

/** `revision + 1` computed by the database. */
const nextRevision = () => sql`${notes.revision} + 1` as unknown as number;

/** Makes the tag links of a note equal the tags in its text. Runs inside the save's transaction. */
export async function rebuildNoteTags(
  scope: UserScope,
  noteId: string,
  contentMd: string,
): Promise<void> {
  const wanted = new Set<string>();
  for (const name of parseTags(contentMd)) {
    wanted.add((await findOrCreateTag(scope, name)).tag.id);
  }
  const existing = await scope.select(entityTags, { where: eq(entityTags.entityId, noteId) });
  const have = new Set(existing.map((link) => link.tagId));
  const gone = existing.filter((link) => !wanted.has(link.tagId)).map((link) => link.id);
  const added = [...wanted].filter((tagId) => !have.has(tagId));
  if (gone.length > 0) await scope.delete(entityTags, inArray(entityTags.id, gone));
  if (added.length > 0) {
    await scope.insert(
      entityTags,
      added.map((tagId) => ({ entityId: noteId, tagId })),
    );
  }
}

/**
 * Runs a note save again once when it lost a race to create the same new tag (a task made the tag at
 * the same moment): the unique index fails the whole transaction, the second run finds the tag.
 */
export async function withTagRetry<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isUniqueViolation(error, TAG_NAME_INDEX)) throw error;
    return work();
  }
}

/** Live notes (when `live`) or any notes that carry the tag. */
async function noteIdsWithTag(scope: UserScope, tagId: string, live: boolean): Promise<string[]> {
  const rows = await scope.selectFields(
    entityTags,
    { entityId: entityTags.entityId },
    {
      where: and(
        eq(entityTags.tagId, tagId),
        sql`${entityTags.entityId} in (select ${notes.id} from ${notes} where ${notes.userId} = ${scope.userId}${live ? sql` and ${notes.deletedAt} is null` : sql``})`,
      ),
    },
  );
  return rows.map((row) => row.entityId as string);
}

/** How many live notes carry the tag. */
export async function liveNoteCount(scope: UserScope, tagId: string): Promise<number> {
  return (await noteIdsWithTag(scope, tagId, true)).length;
}

/** Live note counts for many tags: Map<tagId, count>. */
export async function liveNoteCounts(
  scope: UserScope,
  tagIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (tagIds.length === 0) return counts;
  const rows = await scope.selectFields(
    entityTags,
    { tagId: entityTags.tagId },
    {
      where: and(
        inArray(entityTags.tagId, [...tagIds]),
        sql`${entityTags.entityId} in (select ${notes.id} from ${notes} where ${notes.userId} = ${scope.userId} and ${notes.deletedAt} is null)`,
      ),
    },
  );
  for (const row of rows) {
    const tagId = row.tagId as string;
    counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
  }
  return counts;
}

/** Names of the live tags of each note: Map<noteId, names sorted ignoring case>. */
export async function tagNamesByNote(
  scope: UserScope,
  noteIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (let index = 0; index < noteIds.length; index += BATCH) {
    const links = await scope.select(entityTags, {
      where: inArray(entityTags.entityId, noteIds.slice(index, index + BATCH)),
    });
    if (links.length === 0) continue;
    const found = await scope.select(tags, {
      where: and(scope.isLive(tags), inArray(tags.id, [...new Set(links.map((l) => l.tagId))])),
    });
    const names = new Map(found.map((tag) => [tag.id, tag.name]));
    for (const link of links) {
      const name = names.get(link.tagId);
      if (name === undefined) continue;
      result.set(link.entityId, [...(result.get(link.entityId) ?? []), name]);
    }
  }
  for (const [id, names] of result) {
    result.set(
      id,
      names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
  }
  return result;
}

/**
 * Rewrites `#oldName` to `#newName` in the text of every note (trashed ones too, so a restored note
 * is consistent) that carries the tag, then rebuilds their tag links. Call it after the tag has its
 * new name (rename) or after the source tag is deleted (merge). Returns how many notes changed.
 */
export async function rewriteNotesTag(
  scope: UserScope,
  tagId: string,
  oldName: string,
  newName: string,
): Promise<number> {
  const ids = await noteIdsWithTag(scope, tagId, false);
  let changed = 0;
  for (let index = 0; index < ids.length; index += BATCH) {
    const rows = await scope.select(notes, {
      where: inArray(notes.id, ids.slice(index, index + BATCH)),
    });
    for (const row of rows) {
      const rewritten = rewriteTag(row.contentMd, oldName, newName);
      if (rewritten === row.contentMd) continue;
      await scope.update(
        notes,
        {
          contentMd: rewritten,
          contentText: markdownToPlainText(rewritten),
          revision: nextRevision(),
        },
        eq(notes.id, row.id),
      );
      await rebuildNoteTags(scope, row.id, rewritten);
      changed += 1;
    }
  }
  return changed;
}
