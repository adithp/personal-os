import type { NoteRow } from '@personal-os/db';
import type { NoteVersionReason } from '@personal-os/shared';
import type { UserScope } from '../lib/user-scope';

export type { NoteVersionReason };

/**
 * Version hook that notes.ts already calls with the note as it was BEFORE a content save (memo
 * notes.md D13). No-op until stage N4, which owns this file.
 */
export function maybeSnapshot(
  _scope: UserScope,
  _before: NoteRow,
  _reason: NoteVersionReason,
): Promise<void> {
  return Promise.resolve();
}
