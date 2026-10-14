import { noteVersions, type NoteRow } from '@personal-os/db';
import {
  NOTE_SNAPSHOT_GAP_MINUTES,
  NOTE_VERSIONS_KEEP,
  type NoteVersionReason,
} from '@personal-os/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import type { UserScope } from '../lib/user-scope';

export type { NoteVersionReason };

const GAP_MS = NOTE_SNAPSHOT_GAP_MINUTES * 60_000;

/**
 * Stores the note as it is now (title and text) as a version, unless the rules say no, and returns
 * the id of the version that holds this text (the new one, or the newest when it is equal), or null
 * when nothing was stored. Runs inside the caller's transaction (docs/design/research/notes.md D13):
 *  - never when the text equals the newest version's text;
 *  - `auto`: not when the text is empty, and only when the newest version is older than 10 minutes;
 *  - `before_restore` and `conflict`: always.
 * Then all but the newest 50 versions of the note are deleted.
 * The time comes from the server clock (not the database) so it is the same one the tests fake.
 */
export async function snapshotNote(
  scope: UserScope,
  before: NoteRow,
  reason: NoteVersionReason,
): Promise<string | null> {
  const [newest] = await scope.select(noteVersions, {
    where: eq(noteVersions.noteId, before.id),
    orderBy: [desc(noteVersions.createdAt), desc(noteVersions.id)],
    limit: 1,
  });
  if (newest?.contentMd === before.contentMd) return newest.id;
  const now = new Date();
  if (reason === 'auto') {
    if (before.contentMd === '') return null;
    if (newest && now.getTime() - newest.createdAt.getTime() < GAP_MS) return null;
  }
  // Strictly after the newest version, so "newest" is never a tie
  const createdAt =
    newest && now.getTime() <= newest.createdAt.getTime()
      ? new Date(newest.createdAt.getTime() + 1)
      : now;
  const [stored] = await scope.insert(noteVersions, {
    noteId: before.id,
    title: before.title,
    contentMd: before.contentMd,
    reason,
    createdAt,
  });
  if (!stored) throw new Error('Could not store the version');

  const old = await scope.selectFields(
    noteVersions,
    { id: noteVersions.id },
    {
      where: eq(noteVersions.noteId, before.id),
      orderBy: [desc(noteVersions.createdAt), desc(noteVersions.id)],
      offset: NOTE_VERSIONS_KEEP,
    },
  );
  if (old.length > 0) {
    await scope.delete(
      noteVersions,
      inArray(
        noteVersions.id,
        old.map((row) => row.id as string),
      ),
    );
  }
  return stored.id;
}

/**
 * Version hook that notes.ts calls with the note as it was BEFORE a content save (memo notes.md
 * D13), inside the save's transaction.
 */
export async function maybeSnapshot(
  scope: UserScope,
  before: NoteRow,
  reason: NoteVersionReason,
): Promise<void> {
  await snapshotNote(scope, before, reason);
}
