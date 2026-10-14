import { useEffect } from 'react';
import { useTags } from '../../tasks/tags-queries';
import { useNoteFolders } from '../folders-queries';
import { NoteList } from '../list/note-list';
import { isFolderPlace, TEMPLATES_PLACE, tagIdOf } from '../notes-search';
import { DEFAULT_PLACE, useNotesUi } from '../notes-ui-store';
import { TemplatesView } from '../templates/templates-view';
import { RightPanel } from '../right-panel/right-panel';
import { useNarrowWindow } from '../right-panel/use-narrow-window';
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
  const rightPanelOpen = useNotesUi((state) => state.rightPanelOpen);
  const narrow = useNarrowWindow();
  // The panel needs an open note; below 1252 px it makes the side panel show icons only
  const panelShown = rightPanelOpen && noteId !== null;

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
      isFolderPlace(place) &&
      !folders.data.some((folder) => folder.id === place)
    ) {
      showPlace(DEFAULT_PLACE, true);
    }
  }, [folders.isSuccess, folders.data, place, showPlace]);

  // The same for a tag that no longer exists
  const tags = useTags();
  const tagId = tagIdOf(place);
  useEffect(() => {
    if (tagId !== null && tags.isSuccess && !tags.data.some((tag) => tag.id === tagId)) {
      showPlace(DEFAULT_PLACE, true);
    }
  }, [tagId, tags.isSuccess, tags.data, showPlace]);

  const templates = place === TEMPLATES_PLACE;

  return (
    <div className="flex h-full min-h-0 gap-3 px-4 pt-4">
      <NotesSidePanel forceCollapsed={panelShown && narrow && !templates} />
      {templates ? (
        <TemplatesView />
      ) : (
        <>
          <NoteList key={place} />
          <EditorSlot noteId={noteId} />
          {panelShown && noteId ? <RightPanel noteId={noteId} /> : null}
        </>
      )}
    </div>
  );
}
