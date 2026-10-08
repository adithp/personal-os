import { create } from 'zustand';

interface PaletteState {
  open: boolean;
  /** What is typed in the palette's search field. Cleared whenever the palette closes. */
  query: string;
  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  /** Opens the palette with some text already typed (the dashboard search field uses this). */
  openWith: (query: string) => void;
  toggle: () => void;
}

/** Whether the command palette is open, and its text. Shortcuts and the dashboard search use it. */
export const usePalette = create<PaletteState>()((set) => ({
  open: false,
  query: '',
  setOpen: (open) => {
    // Always starts and ends empty; openWith is the only way to open with text
    set({ open, query: '' });
  },
  setQuery: (query) => {
    set({ query });
  },
  openWith: (query) => {
    set({ open: true, query });
  },
  toggle: () => {
    set((state) => ({ open: !state.open, query: '' }));
  },
}));
