import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface MoneyUiState {
  /** The inner side panel is collapsed to icons. Saved on this device. */
  sidePanelCollapsed: boolean;
  /** The keyboard shortcuts help is open. Not saved. */
  helpOpen: boolean;
  toggleSidePanel: () => void;
  setHelpOpen: (open: boolean) => void;
}

const defaults = { sidePanelCollapsed: false, helpOpen: false };

/** UI state of the Money module (not server data). */
export const useMoneyUi = create<MoneyUiState>()(
  persist(
    (set) => ({
      ...defaults,
      toggleSidePanel: () => {
        set((state) => ({ sidePanelCollapsed: !state.sidePanelCollapsed }));
      },
      setHelpOpen: (helpOpen) => {
        set({ helpOpen });
      },
    }),
    {
      name: 'personal-os.money-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sidePanelCollapsed: state.sidePanelCollapsed }),
    },
  ),
);

/** Back to the defaults (tests). */
export function resetMoneyUi(): void {
  useMoneyUi.setState({ ...defaults });
}
