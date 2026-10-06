import { create } from 'zustand';

interface PaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

/** Whether the command palette is open. The shortcut and the dashboard search bar both use it. */
export const usePalette = create<PaletteState>()((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
  toggle: () => {
    set((state) => ({ open: !state.open }));
  },
}));
