import type { ListNotesInput } from '@personal-os/shared';

/** Every cached notes query (lists and single notes) starts with this key. */
export const NOTES_KEY = ['notes'] as const;
/** Every cached folder list starts with this key. */
export const NOTE_FOLDERS_KEY = ['note-folders'] as const;

export const noteKeys = {
  all: NOTES_KEY,
  lists: [...NOTES_KEY, 'list'] as const,
  list: (filters: ListNotesInput) => [...NOTES_KEY, 'list', filters] as const,
  detail: (id: string) => [...NOTES_KEY, 'detail', id] as const,
  // Under NOTES_KEY, so every write's refresh (and Realtime on `notes`) refreshes them too
  titles: [...NOTES_KEY, 'titles'] as const,
  /** Links of every note (invalidate after a save) or of one. */
  allLinks: [...NOTES_KEY, 'links'] as const,
  links: (id: string) => [...NOTES_KEY, 'links', id] as const,
};
