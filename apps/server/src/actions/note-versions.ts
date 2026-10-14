import { noteVersions, type NoteRow } from '@personal-os/db';
import {
  NOTE_SNAPSHOT_GAP_MINUTES,
  NOTE_VERSIONS_KEEP,
  type NoteVersionReason,
} from '@personal-os/shared';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { UserScope } from '../lib/user-scope';

export type { NoteVersionReason };

const GAP_MS = NOTE_SNAPSHOT_GAP_MINUTES * 60_000;
/** A save that leaves under 20% of a text of at least 200 characters is a likely data loss. */
const BIG_CUT_MIN_CHARS = 200;
const BIG_CUT_RATIO = 0.2;

/**
 * Stores the note as it is now (title and text) as a version, unless the rules say no, and returns
 * the id of the version that holds this text (the new one, or the newest when it is equal), or null
 * when nothing was stored. Runs inside the caller's transaction (docs/design/research/notes.md D13):
 *  - never when the text equals the newest version's text;
 *  - `auto`: not when the text is empty, and only when the newest version is older than 10 minutes,
 *    unless `next` (the new text) is under 20% of a text of 200+ characters (a likely data loss);
 *  - `before_restore` and `conflict`: always.
 * Then versions over 50 are deleted, the oldest `auto` ones first, any reason only when no `auto` is left.
 * The time comes from the server clock (not the database) so it is the same one the tests fake.
 */
export async function snapshotNote(
  scope: UserScope,
  before: NoteRow,
  reason: NoteVersionReason,
  next?: string,
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
    const insideGap = newest && now.getTime() - newest.createdAt.getTime() < GAP_MS;
    // A save that wipes or cuts most of a long text is stored even inside the gap
    const bigCut =
      next !== undefined &&
      before.contentMd.length >= BIG_CUT_MIN_CHARS &&
      next.length < before.contentMd.length * BIG_CUT_RATIO;
    if (insideGap && !bigCut) return null;
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

  const all = await scope.selectFields(
    noteVersions,
    { id: noteVersions.id, reason: noteVersions.reason },
    {
      where: eq(noteVersions.noteId, before.id),
      orderBy: [asc(noteVersions.createdAt), asc(noteVersions.id)],
    },
  );
  const excess = all.length - NOTE_VERSIONS_KEEP;
  if (excess > 0) {
    // Oldest first; `auto` versions go before the ones a person's action created
    const autos = all.filter((row) => row.reason === 'auto');
    const others = all.filter((row) => row.reason !== 'auto');
    const doomed = [...autos, ...others].slice(0, excess);
    await scope.delete(
      noteVersions,
      inArray(
        noteVersions.id,
        doomed.map((row) => row.id as string),
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
  next?: string,
): Promise<void> {
  await snapshotNote(scope, before, reason, next);
}
