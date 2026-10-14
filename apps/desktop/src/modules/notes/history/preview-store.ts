import type { NoteVersion } from '@personal-os/shared';
import { create } from 'zustand';

/** What one note is previewing: the version chosen and, once loaded, its text. */
interface Preview {
  versionId: string;
  showChanges: boolean;
  version?: NoteVersion;
}

interface PreviewState {
  byNote: Record<string, Preview>;
  open: (noteId: string, versionId: string) => void;
  close: (noteId: string) => void;
  setShowChanges: (noteId: string, showChanges: boolean) => void;
  /** The bar hands over the version once it is loaded; the editor pane reads it from here. */
  setVersion: (noteId: string, version: NoteVersion) => void;
}

/** UI state of the version preview, one entry per note (not server data). */
export const useVersionPreviewStore = create<PreviewState>()((set) => ({
  byNote: {},
  open: (noteId, versionId) => {
    set((state) => {
      const current = state.byNote[noteId];
      if (current?.versionId === versionId) return state;
      return {
        byNote: {
          ...state.byNote,
          [noteId]: { versionId, showChanges: current?.showChanges ?? false },
        },
      };
    });
  },
  close: (noteId) => {
    set((state) => {
      if (!(noteId in state.byNote)) return state;
      const { [noteId]: _gone, ...rest } = state.byNote;
      return { byNote: rest };
    });
  },
  setShowChanges: (noteId, showChanges) => {
    set((state) => {
      const current = state.byNote[noteId];
      return current
        ? { byNote: { ...state.byNote, [noteId]: { ...current, showChanges } } }
        : state;
    });
  },
  setVersion: (noteId, version) => {
    set((state) => {
      const current = state.byNote[noteId];
      if (current?.versionId !== version.id) return state;
      return { byNote: { ...state.byNote, [noteId]: { ...current, version } } };
    });
  },
}));

/**
 * The preview of one note, for the editor pane: `version` is set once the chosen version has
 * loaded (the pane then shows its text, read-only), `showChanges` says to show the line diff.
 */
export function useVersionPreview(noteId: string) {
  const preview = useVersionPreviewStore((state) => state.byNote[noteId]);
  return {
    versionId: preview?.versionId ?? null,
    version: preview?.version,
    showChanges: preview?.showChanges ?? false,
  };
}

export function resetVersionPreview(): void {
  useVersionPreviewStore.setState({ byNote: {} });
}
