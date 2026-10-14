import { useNavigate, useSearch } from '@tanstack/react-router';
import { folderParam, placeOf, type NotesSearch } from '../notes-search';
import type { NotesPlace } from '../notes-ui-store';

/** Reads and changes the open note and the place in the URL of the Notes page. */
export function useNotesNav() {
  const search: NotesSearch = useSearch({ from: '/_app/notes' });
  const navigate = useNavigate();

  const go = (next: NotesSearch, replace = false) => {
    void navigate({ to: '/notes', search: next, replace });
  };

  return {
    noteId: search.note ?? null,
    place: placeOf(search),
    /** Open a note (or close the editor with null); the place stays. */
    openNote: (id: string | null, replace = false) => {
      go(
        { ...(search.folder ? { folder: search.folder } : {}), ...(id ? { note: id } : {}) },
        replace,
      );
    },
    /** Show a place in the list; the open note stays. */
    showPlace: (place: NotesPlace, replace = false) => {
      const folder = folderParam(place);
      go({ ...(folder ? { folder } : {}), ...(search.note ? { note: search.note } : {}) }, replace);
    },
    /** Both at once (a new note in the place you are looking at). */
    show: (place: NotesPlace, id: string | null) => {
      const folder = folderParam(place);
      go({ ...(folder ? { folder } : {}), ...(id ? { note: id } : {}) });
    },
  };
}
