import { noteVersions, notes, type NoteRow } from '@personal-os/db';
import {
  countWords,
  markdownToPlainText,
  noteVersionActions,
  wordsDelta,
  type NoteVersion,
  type NoteVersionSummary,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { rebuildNoteLinks } from './note-links';
import { toNote } from './notes';
import { rebuildNoteTags, tagNamesByNote, withTagRetry } from './note-tags';
import { snapshotNote } from './note-versions';
import { implement } from './registry';

/**
 * notes.versions, notes.getVersion and notes.restoreVersion (docs/design/research/notes.md D13,
 * D18). The hook that stores versions is maybeSnapshot in note-versions.ts.
 */

const iso = (date: Date) => date.toISOString();
const noteNotFound = () => new HttpError(404, 'not_found', 'Note not found');
const versionNotFound = () => new HttpError(404, 'not_found', 'Version not found');

/** The note must be this user's (live, or trashed too with includeDeleted). */
async function findNote(scope: UserScope, id: string, includeDeleted: boolean): Promise<NoteRow> {
  const [row] = await scope.select(notes, {
    where: includeDeleted ? eq(notes.id, id) : and(eq(notes.id, id), scope.isLive(notes)),
    limit: 1,
  });
  if (!row) throw noteNotFound();
  return row;
}

async function findVersion(scope: UserScope, noteId: string, versionId: string) {
  const [row] = await scope.select(noteVersions, {
    where: and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)),
    limit: 1,
  });
  if (!row) throw versionNotFound();
  return row;
}

export const noteVersionImplementations = [
  // Works for trashed notes too, like notes.get
  implement(noteVersionActions.versions, async ({ scope }, { id }) => {
    await findNote(scope, id, true);
    const rows = await scope.selectFields(
      noteVersions,
      {
        id: noteVersions.id,
        createdAt: noteVersions.createdAt,
        reason: noteVersions.reason,
        contentMd: noteVersions.contentMd,
      },
      {
        where: eq(noteVersions.noteId, id),
        orderBy: [desc(noteVersions.createdAt), desc(noteVersions.id)],
      },
    );
    const text = (index: number) => markdownToPlainText((rows[index]?.contentMd as string | undefined) ?? '');
    const data = rows.map((row, index): NoteVersionSummary => ({
      id: row.id as string,
      createdAt: iso(row.createdAt as Date),
      reason: row.reason as NoteVersionSummary['reason'],
      words: countWords(text(index)),
      // Rows are newest first, so the next older version is the next index (none = empty text)
      wordsDelta: wordsDelta(text(index + 1), text(index)),
    }));
    return { data };
  }),

  implement(noteVersionActions.getVersion, async ({ scope }, { id, versionId }) => {
    await findNote(scope, id, true);
    const row = await findVersion(scope, id, versionId);
    const [older] = await scope.select(noteVersions, {
      where: and(eq(noteVersions.noteId, id), lt(noteVersions.createdAt, row.createdAt)),
      orderBy: [desc(noteVersions.createdAt), desc(noteVersions.id)],
      limit: 1,
    });
    const text = markdownToPlainText(row.contentMd);
    const data: NoteVersion = {
      id: row.id,
      createdAt: iso(row.createdAt),
      reason: row.reason as NoteVersion['reason'],
      words: countWords(text),
      wordsDelta: wordsDelta(markdownToPlainText(older?.contentMd ?? ''), text),
      title: row.title,
      contentMd: row.contentMd,
    };
    return { data };
  }),

  implement(noteVersionActions.restoreVersion, ({ scope }, { id, versionId }) =>
    // Same queue and retry as notes.update: it rebuilds links and tags from the new text
    withUserLock('notes', scope.userId, () =>
      withTagRetry(() =>
        scope.transaction(async (tx) => {
          const before = await findNote(tx, id, false);
          const version = await findVersion(tx, id, versionId);
          if (version.contentMd === before.contentMd) return { data: toNote(before), undo: null };
          const undoVersionId = await snapshotNote(tx, before, 'before_restore');
          const [updated] = await tx.update(
            notes,
            {
              contentMd: version.contentMd,
              contentText: markdownToPlainText(version.contentMd),
              revision: sql`${notes.revision} + 1` as unknown as number,
            },
            sql`${eq(notes.id, id)} and ${tx.isLive(notes)}`,
          );
          if (!updated) throw noteNotFound();
          await rebuildNoteLinks(tx, id, updated.contentMd);
          await rebuildNoteTags(tx, id, updated.contentMd);
          const tagNames = (await tagNamesByNote(tx, [id])).get(id) ?? [];
          const data = { ...toNote(updated), tagNames };
          return {
            data,
            undo: undoVersionId
              ? ({
                  action: 'notes.restoreVersion',
                  input: { id, versionId: undoVersionId },
                } satisfies UndoDescriptor)
              : null,
          };
        }),
      ),
    ),
  ),
];
