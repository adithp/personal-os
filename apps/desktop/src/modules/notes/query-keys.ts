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
};
