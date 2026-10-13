import { create } from 'zustand';

/**
 * Whether the Manage tags dialog is open. "Manage tags…" in the tag chip menu and in the My tasks
 * Filter menu call openManageTags(); the dialog is mounted once in the Tasks layout.
 */
interface ManageTagsState {
  open: boolean;
  openManageTags: () => void;
  closeManageTags: () => void;
}

export const useManageTags = create<ManageTagsState>((set) => ({
  open: false,
  openManageTags: () => {
    set({ open: true });
  },
  closeManageTags: () => {
    set({ open: false });
  },
}));
