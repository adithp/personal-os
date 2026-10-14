import { NOTE_SORTS, type NoteSort } from '@personal-os/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** The place whose notes the list shows: 'all', 'trash', or a folder id. */
export type NotesPlace = string;
export const DEFAULT_PLACE: NotesPlace = 'all';
export const DEFAULT_NOTE_SORT: NoteSort = 'updated';

interface NotesUiState {
  /** The last place shown; opening Notes with no link returns to it. Saved on this device. */
  place: NotesPlace;
  sort: NoteSort;
  /** The inner side panel is collapsed to icons. Saved on this device. */
  sidePanelCollapsed: boolean;
  /** The right panel (links, outline; stage N2) is open. Saved on this device. */
  rightPanelOpen: boolean;
  /** Folders the user folded in the tree (all start open). Saved on this device. */
  collapsedFolders: Record<string, boolean>;
  setPlace: (place: NotesPlace) => void;
  setSort: (sort: NoteSort) => void;
  toggleSidePanel: () => void;
  toggleRightPanel: () => void;
  setFolderCollapsed: (id: string, collapsed: boolean) => void;
}

const defaults = {
  place: DEFAULT_PLACE,
  sort: DEFAULT_NOTE_SORT,
  sidePanelCollapsed: false,
  rightPanelOpen: false,
  collapsedFolders: {} as Record<string, boolean>,
};

/** UI state of the Notes module (not server data). */
export const useNotesUi = create<NotesUiState>()(
  persist(
    (set) => ({
      ...defaults,
      setPlace: (place) => {
        set({ place });
      },
      setSort: (sort) => {
        set({ sort });
      },
      toggleSidePanel: () => {
        set((state) => ({ sidePanelCollapsed: !state.sidePanelCollapsed }));
      },
      toggleRightPanel: () => {
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen }));
      },
      setFolderCollapsed: (id, collapsed) => {
        set((state) => ({ collapsedFolders: { ...state.collapsedFolders, [id]: collapsed } }));
      },
    }),
    {
      name: 'personal-os.notes-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // A saved sort that is no longer valid falls back to the default
      merge: (saved, current) => {
        const stored = (saved ?? {}) as Partial<NotesUiState>;
        const sort = NOTE_SORTS.find((key) => key === stored.sort) ?? DEFAULT_NOTE_SORT;
        return { ...current, ...stored, sort };
      },
    },
  ),
);

/** Back to the defaults (tests and "reset"). */
export function resetNotesUi(): void {
  useNotesUi.setState({ ...defaults, collapsedFolders: {} });
}
