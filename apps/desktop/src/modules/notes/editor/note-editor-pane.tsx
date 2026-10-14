import { useNote } from '../notes-queries';

/**
 * Placeholder until the editor agent's version is merged (it keeps the prop `{ noteId: string }`).
 * Shows the title only.
 */
export function NoteEditorPane({ noteId }: { noteId: string }) {
  const note = useNote(noteId);
  return <div className="p-4 text-body text-fg">{note.data?.title ?? ''}</div>;
}
