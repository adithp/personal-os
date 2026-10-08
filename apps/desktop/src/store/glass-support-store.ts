import { create } from 'zustand';

interface GlassSupportState {
  /** Liquid Glass was chosen but this computer cannot draw it, so Simple glass is shown. */
  liquidUnavailable: boolean;
  setLiquidUnavailable: (unavailable: boolean) => void;
}

/** Runtime only (not saved): the Settings screen reads it to explain a fallback. */
export const useGlassSupport = create<GlassSupportState>()((set) => ({
  liquidUnavailable: false,
  setLiquidUnavailable: (liquidUnavailable) => {
    set({ liquidUnavailable });
  },
}));
