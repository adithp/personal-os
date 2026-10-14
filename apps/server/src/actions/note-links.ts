import { links, notes } from '@personal-os/db';
import { markdownToPlainText, parseWikilinks, rewriteWikilinks } from '@personal-os/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UserScope } from '../lib/user-scope';

/**
 * Wikilink maintenance (research memo notes.md D8, D9). notes.ts calls these inside its own
 * transaction. The `mentions` links of a note always equal the live notes its `[[wikilinks]]`
 * resolve to (by lower(title)); unresolved targets are not stored, so a title that appears later
 * (create, rename, restore) or disappears (trash) triggers an ILIKE scan of the notes that mention it.
 *
 * Known limit (notes.ts owner decides): the transaction takes no lock, so two saves at the same
 * moment can each miss the other's new note or title (write skew) and leave a link unstored until
 * the next save of that note. `withUserLock('notes', userId)` around the whole save would close it.
 */

const BATCH = 500;

const lower = (text: string) => text.toLowerCase();

/** Wikilink targets of a text, lowercased and without duplicates. */
function targetsOf(contentMd: string): string[] {
  return [...new Set(parseWikilinks(contentMd).map((link) => lower(link.target)))];
}

/** Live notes by lowercase title: Map<lowercase title, id>. */
export async function resolveTitles(
  scope: UserScope,
  lowered: readonly string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let index = 0; index < lowered.length; index += BATCH) {
    const rows = await scope.selectFields(
      notes,
      { id: notes.id, title: notes.title },
      {
        where: and(
          scope.isLive(notes),
          inArray(sql`lower(${notes.title})`, lowered.slice(index, index + BATCH)),
        ),
      },
    );
    for (const row of rows) found.set(lower(row.title as string), row.id as string);
  }
  return found;
}

/** `revision + 1` computed by the database. */
const nextRevision = () => sql`${notes.revision} + 1` as unknown as number;

/**
 * A LIKE pattern for text that has `[[`, then anything (the spaces some writers put after `[[`),
 * then the title. It is only a pre-filter; callers confirm with `targetsOf`.
 */
const linkPattern = (title: string) => `%[[%${title.trim().replace(/[\\%_]/g, '\\$&')}%`;

interface Snapshot {
  id: string;
  revision: number;
  contentMd: string;
}

const snapshotFields = { id: notes.id, revision: notes.revision, contentMd: notes.contentMd };

const toSnapshot = (row: Record<'id' | 'revision' | 'contentMd', unknown>): Snapshot => ({
  id: row.id as string,
  revision: row.revision as number,
  contentMd: row.contentMd as string,
});

/**
 * Notes (other than `exceptId`) that really link to `title` outside code. `trashed` picks the
 * trashed notes instead of the live ones.
 */
async function notesMentioning(
  scope: UserScope,
  title: string,
  options: { exceptId?: string; trashed?: boolean } = {},
): Promise<Snapshot[]> {
  const wanted = lower(title.trim());
  const rows = await scope.selectFields(notes, snapshotFields, {
    where: and(
      options.trashed ? sql`${notes.deletedAt} is not null` : scope.isLive(notes),
      sql`${notes.contentMd} ilike ${linkPattern(title)}`,
      options.exceptId ? sql`${notes.id} <> ${options.exceptId}` : undefined,
    ),
  });
  return rows.map(toSnapshot).filter((row) => targetsOf(row.contentMd).includes(wanted));
}

/** Makes the `mentions` links of a note equal the wikilinks in its text. Runs inside the save. */
export async function rebuildNoteLinks(
  scope: UserScope,
  noteId: string,
  contentMd: string,
): Promise<void> {
  const wanted = new Set<string>();
  const lowered = targetsOf(contentMd);
  if (lowered.length > 0) {
    for (const id of (await resolveTitles(scope, lowered)).values()) {
      if (id !== noteId) wanted.add(id);
    }
  }
  const existing = await scope.select(links, {
    where: and(eq(links.sourceId, noteId), eq(links.relation, 'mentions'), scope.isLive(links)),
  });
  const have = new Set(existing.map((link) => link.targetId));
  const added = [...wanted].filter((id) => !have.has(id));
  const gone = existing.filter((link) => !wanted.has(link.targetId)).map((link) => link.id);
  if (added.length > 0) {
    await scope.insert(
      links,
      added.map((targetId) => ({ sourceId: noteId, targetId, relation: 'mentions' as const })),
    );
  }
  if (gone.length > 0) await scope.softDelete(links, inArray(links.id, gone));
}

export type RewriteResult =
  | { status: 'rewritten'; contentMd: string }
  | { status: 'unchanged'; contentMd: string }
  | { status: 'skipped' };

/**
 * Rewrites the links to `oldTitle` in one note, only if the note still has the revision that was
 * read (so a save made in between is never overwritten). On a miss it reads the note again and
 * tries once more; if that also misses, the note is skipped (its own save rebuilds its links).
 */
export async function rewriteNoteLinks(
  scope: UserScope,
  snapshot: Snapshot,
  oldTitle: string,
  newTitle: string,
): Promise<RewriteResult> {
  let current = snapshot;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rewritten = rewriteWikilinks(current.contentMd, oldTitle, newTitle);
    if (rewritten === current.contentMd) return { status: 'unchanged', contentMd: rewritten };
    const updated = await scope.update(
      notes,
      {
        contentMd: rewritten,
        contentText: markdownToPlainText(rewritten),
        revision: nextRevision(),
      },
      scope.where(notes, and(eq(notes.id, current.id), eq(notes.revision, current.revision))),
    );
    if (updated.length > 0) return { status: 'rewritten', contentMd: rewritten };
    const [fresh] = await scope.selectFields(notes, snapshotFields, {
      where: eq(notes.id, current.id),
      limit: 1,
    });
    if (!fresh) return { status: 'skipped' };
    current = toSnapshot(fresh);
  }
  return { status: 'skipped' };
}

/**
 * Rewrites [[old]] to [[new]] in the notes that link to this one; returns the ids of changed live
 * notes. Trashed notes are rewritten too (so a restored note is consistent) but not reported.
 */
export async function rewriteLinksOnRename(
  scope: UserScope,
  noteId: string,
  oldTitle: string,
  newTitle: string,
): Promise<string[]> {
  // Notes linking here (links rows) plus notes whose text mentions the old title (older unresolved links)
  const linking = await scope.selectFields(
    links,
    { sourceId: links.sourceId },
    { where: and(eq(links.targetId, noteId), eq(links.relation, 'mentions'), scope.isLive(links)) },
  );
  const linkingIds = new Set(
    linking.map((row) => row.sourceId as string).filter((id) => id !== noteId),
  );
  const candidates = new Map<string, Snapshot>();
  const ids = [...linkingIds];
  for (let index = 0; index < ids.length; index += BATCH) {
    const rows = await scope.selectFields(notes, snapshotFields, {
      where: and(scope.isLive(notes), inArray(notes.id, ids.slice(index, index + BATCH))),
    });
    for (const row of rows) candidates.set(row.id as string, toSnapshot(row));
  }
  for (const row of await notesMentioning(scope, oldTitle, { exceptId: noteId })) {
    candidates.set(row.id, row);
  }

  const changed: string[] = [];
  const rebuild = new Map<string, string>();
  const skipped = new Set<string>();
  for (const [id, snapshot] of candidates) {
    const result = await rewriteNoteLinks(scope, snapshot, oldTitle, newTitle);
    if (result.status === 'skipped') skipped.add(id);
    else if (result.status === 'rewritten') {
      changed.push(id);
      rebuild.set(id, result.contentMd);
    } else if (linkingIds.has(id)) rebuild.set(id, result.contentMd); // its stored link is stale
  }
  // Notes that already had an unresolved [[newTitle]] now resolve
  for (const row of await notesMentioning(scope, newTitle, { exceptId: noteId })) {
    if (!skipped.has(row.id) && !rebuild.has(row.id)) rebuild.set(row.id, row.contentMd);
  }
  for (const [id, contentMd] of rebuild) await rebuildNoteLinks(scope, id, contentMd);

  for (const row of await notesMentioning(scope, oldTitle, { exceptId: noteId, trashed: true })) {
    await rewriteNoteLinks(scope, row, oldTitle, newTitle);
  }
  return changed;
}

/** Re-resolves links when a note is created, restored or trashed (a title becomes or stops being a target). */
export async function reresolveLinksTo(scope: UserScope, title: string): Promise<void> {
  for (const row of await notesMentioning(scope, title)) {
    await rebuildNoteLinks(scope, row.id, row.contentMd);
  }
  // A restored note picks up links to notes created while it was in the trash
  const wanted = lower(title);
  const own = (await resolveTitles(scope, [wanted])).get(wanted);
  if (own) {
    const [row] = await scope.select(notes, { where: eq(notes.id, own), limit: 1 });
    if (row) await rebuildNoteLinks(scope, own, row.contentMd);
  }
}
