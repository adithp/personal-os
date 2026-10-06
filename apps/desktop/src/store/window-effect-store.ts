import { create } from 'zustand';

/** Result of the last attempt to turn on the see-through window effect. */
export type WindowEffectStatus = 'pending' | 'ok' | 'failed';

interface WindowEffectState {
  status: WindowEffectStatus;
  setStatus: (status: WindowEffectStatus) => void;
}

/** Runtime only (not saved): the Settings screen reads it to explain a fallback. */
export const useWindowEffect = create<WindowEffectState>()((set) => ({
  status: 'pending',
  setStatus: (status) => {
    set({ status });
  },
}));
