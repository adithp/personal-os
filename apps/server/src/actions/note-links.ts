import type { UserScope } from '../lib/user-scope';

/**
 * Link hooks that notes.ts already calls (research memo notes.md D8, D9). No-ops in stage N1; the
 * stage N2 server-dev agent fills them in and owns this file, so notes.ts is never edited again.
 */

/** Makes the `mentions` links of a note equal the wikilinks in its text. Runs inside the save. */
export function rebuildNoteLinks(
  _scope: UserScope,
  _noteId: string,
  _contentMd: string,
): Promise<void> {
  return Promise.resolve();
}

/** Rewrites [[old]] to [[new]] in the notes that link to this one; returns the ids of changed notes. */
export function rewriteLinksOnRename(
  _scope: UserScope,
  _noteId: string,
  _oldTitle: string,
  _newTitle: string,
): Promise<string[]> {
  return Promise.resolve([]);
}

/** Re-resolves links when a note is created, restored or trashed (a title becomes or stops being a target). */
export function reresolveLinksTo(_scope: UserScope, _title: string): Promise<void> {
  return Promise.resolve();
}
