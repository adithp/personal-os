import type { RealtimeKeys } from '../../realtime/registry';
import { NOTE_FOLDERS_KEY, NOTES_KEY } from './query-keys';

/** Which cached queries go stale when a Notes table changes (research memo notes.md D17). */
export const notesRealtimeKeys: RealtimeKeys = {
  // Folders carry the number of notes in them
  notes: [NOTES_KEY, NOTE_FOLDERS_KEY],
  note_folders: [NOTE_FOLDERS_KEY, NOTES_KEY],
};
