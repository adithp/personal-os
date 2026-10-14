import { useEffect } from 'react';
import { useNoteFolders } from '../folders-queries';
import { NoteList } from '../list/note-list';
import { DEFAULT_PLACE, useNotesUi } from '../notes-ui-store';
import { EditorSlot } from './editor-slot';
import { NotesSidePanel } from './side-panel';
import { useNotesNav } from './use-notes-nav';

/**
 * The Notes page: the inner side panel, the note list, and the editor. The open note and the
 * place shown (`note` and `folder`) are in the URL, so a link opens straight to a note.
 */
export function NotesLayout() {
  const nav = useNotesNav();
  const setPlace = useNotesUi((state) => state.setPlace);
  const folders = useNoteFolders();
  const { place, noteId, showPlace } = nav;

  // Opening Notes with no link returns to the last place
  useEffect(() => {
    const saved = useNotesUi.getState().place;
    if (noteId === null && place === DEFAULT_PLACE && saved !== DEFAULT_PLACE)
      showPlace(saved, true);
    // Only when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPlace(place);
  }, [place, setPlace]);

  // A folder that is gone (deleted, or an old link) shows All notes instead
  useEffect(() => {
    if (
      folders.isSuccess &&
      place !== DEFAULT_PLACE &&
      place !== 'trash' &&
      !folders.data.some((folder) => folder.id === place)
    ) {
      showPlace(DEFAULT_PLACE, true);
    }
  }, [folders.isSuccess, folders.data, place, showPlace]);

  return (
    <div className="flex h-full min-h-0 gap-3 px-4 pt-4">
      <NotesSidePanel />
      <NoteList key={place} />
      <EditorSlot noteId={noteId} />
    </div>
  );
}
