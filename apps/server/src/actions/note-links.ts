import { links, notes } from '@personal-os/db';
import { markdownToPlainText, parseWikilinks, rewriteWikilinks } from '@personal-os/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UserScope } from '../lib/user-scope';

/**
 * Wikilink maintenance (research memo notes.md D8, D9). notes.ts calls these inside its own
 * transaction. The `mentions` links of a note always equal the live notes its `[[wikilinks]]`
 * resolve to (by lower(title)); unresolved targets are not stored, so a title that appears later
 * (create, rename, restore) or disappears (trash) triggers an ILIKE scan of the notes that mention it.
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

/** A LIKE pattern matching text that contains `[[` followed by the title (case-insensitive). */
const linkPattern = (title: string) => `%[[${title.replace(/[\\%_]/g, '\\$&')}%`;

/** Live notes (other than `exceptId`) whose text contains `[[title`, as { id, contentMd }. */
async function notesMentioning(scope: UserScope, title: string, exceptId?: string) {
  const rows = await scope.selectFields(
    notes,
    { id: notes.id, contentMd: notes.contentMd },
    {
      where: and(
        scope.isLive(notes),
        sql`${notes.contentMd} ilike ${linkPattern(title)}`,
        exceptId ? sql`${notes.id} <> ${exceptId}` : undefined,
      ),
    },
  );
  return rows.map((row) => ({ id: row.id as string, contentMd: row.contentMd as string }));
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

/** Rewrites [[old]] to [[new]] in the notes that link to this one; returns the ids of changed notes. */
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
  const byId = new Map<string, string>();
  const linkingIds = linking.map((row) => row.sourceId as string).filter((id) => id !== noteId);
  for (let index = 0; index < linkingIds.length; index += BATCH) {
    const rows = await scope.selectFields(
      notes,
      { id: notes.id, contentMd: notes.contentMd },
      {
        where: and(scope.isLive(notes), inArray(notes.id, linkingIds.slice(index, index + BATCH))),
      },
    );
    for (const row of rows) byId.set(row.id as string, row.contentMd as string);
  }
  for (const row of await notesMentioning(scope, oldTitle, noteId)) byId.set(row.id, row.contentMd);

  const changed: string[] = [];
  for (const [id, contentMd] of byId) {
    const rewritten = rewriteWikilinks(contentMd, oldTitle, newTitle);
    if (rewritten === contentMd) continue;
    await scope.update(
      notes,
      {
        contentMd: rewritten,
        contentText: markdownToPlainText(rewritten),
        revision: nextRevision(),
      },
      eq(notes.id, id),
    );
    byId.set(id, rewritten);
    changed.push(id);
  }
  // Rebuild every candidate; also notes that already had an unresolved [[newTitle]]
  for (const row of await notesMentioning(scope, newTitle, noteId)) byId.set(row.id, row.contentMd);
  for (const [id, contentMd] of byId) await rebuildNoteLinks(scope, id, contentMd);
  return changed;
}

/** Re-resolves links when a note is created, restored or trashed (a title becomes or stops being a target). */
export async function reresolveLinksTo(scope: UserScope, title: string): Promise<void> {
  const wanted = lower(title);
  for (const row of await notesMentioning(scope, title)) {
    if (targetsOf(row.contentMd).includes(wanted))
      await rebuildNoteLinks(scope, row.id, row.contentMd);
  }
  // A restored note picks up links to notes created while it was in the trash
  const own = (await resolveTitles(scope, [wanted])).get(wanted);
  if (own) {
    const [row] = await scope.select(notes, { where: eq(notes.id, own), limit: 1 });
    if (row) await rebuildNoteLinks(scope, own, row.contentMd);
  }
}
