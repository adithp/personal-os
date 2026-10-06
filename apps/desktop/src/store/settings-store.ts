import type { AppSettings, DockIconSize } from '@personal-os/shared';
import { DEFAULT_SETTINGS, DOCK_ICON_SIZES, THEME_MODES, clampBlur } from '@personal-os/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SETTINGS_STORAGE_KEY = 'personal-os.settings';

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Keeps valid saved values and falls back to defaults for anything missing or corrupt. */
export function sanitizeSettings(raw: unknown): AppSettings {
  const saved = isRecord(raw) ? raw : {};
  const { theme, wallpaperEnabled, blurPx, dockAutoHide, dockMagnification, dockIconSize } = saved;
  return {
    theme: THEME_MODES.find((mode) => mode === theme) ?? DEFAULT_SETTINGS.theme,
    wallpaperEnabled:
      typeof wallpaperEnabled === 'boolean' ? wallpaperEnabled : DEFAULT_SETTINGS.wallpaperEnabled,
    blurPx: typeof blurPx === 'number' ? clampBlur(blurPx) : DEFAULT_SETTINGS.blurPx,
    dockAutoHide: typeof dockAutoHide === 'boolean' ? dockAutoHide : DEFAULT_SETTINGS.dockAutoHide,
    dockMagnification:
      typeof dockMagnification === 'boolean'
        ? dockMagnification
        : DEFAULT_SETTINGS.dockMagnification,
    dockIconSize:
      (Object.keys(DOCK_ICON_SIZES) as DockIconSize[]).find((size) => size === dockIconSize) ??
      DEFAULT_SETTINGS.dockIconSize,
  };
}

/** Appearance and dock settings, saved on this device (moves to the server in Step 3). */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => {
        set((state) => sanitizeSettings({ ...state, ...patch }));
      },
      reset: () => {
        set({ ...DEFAULT_SETTINGS });
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      partialize: (state): AppSettings => ({
        theme: state.theme,
        wallpaperEnabled: state.wallpaperEnabled,
        blurPx: state.blurPx,
        dockAutoHide: state.dockAutoHide,
        dockMagnification: state.dockMagnification,
        dockIconSize: state.dockIconSize,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
    },
  ),
);
