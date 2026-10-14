import type { UserScope } from '../lib/user-scope';

/** Tag hook that notes.ts already calls (memo notes.md D10). No-op until stage N3, which owns this file. */
export function rebuildNoteTags(
  _scope: UserScope,
  _noteId: string,
  _contentMd: string,
): Promise<void> {
  return Promise.resolve();
}
