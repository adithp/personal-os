import type { AppSettings, DockIconSize } from '@personal-os/shared';
import {
  BACKGROUND_MODES,
  DEFAULT_SETTINGS,
  GLASS_EFFECTS,
  DOCK_ICON_SIZES,
  THEME_MODES,
  WALLPAPER_SOURCES,
  clampBlur,
  clampLiquidStrength,
  isWallpaperFileName,
} from '@personal-os/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SETTINGS_STORAGE_KEY = 'personal-os.settings';

/** Version 1 saved "wallpaperEnabled"; version 2 saves "backgroundMode". */
const SETTINGS_VERSION = 2;

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Background mode from saved data. Settings saved before the three modes existed only had a
 * wallpaper on/off switch: Off means a solid color, anything else gets the new default.
 */
function backgroundModeFrom(saved: Record<string, unknown>): AppSettings['backgroundMode'] {
  const mode = BACKGROUND_MODES.find((candidate) => candidate === saved.backgroundMode);
  if (mode) return mode;
  if (saved.wallpaperEnabled === false) return 'solid';
  return DEFAULT_SETTINGS.backgroundMode;
}

/** Keeps valid saved values and falls back to defaults for anything missing or corrupt. */
export function sanitizeSettings(raw: unknown): AppSettings {
  const saved = isRecord(raw) ? raw : {};
  const {
    theme,
    glassEffect,
    liquidStrength,
    blurPx,
    wallpaperSource,
    wallpaperFile,
    dockAutoHide,
    dockMagnification,
    dockIconSize,
  } = saved;
  return {
    theme: THEME_MODES.find((mode) => mode === theme) ?? DEFAULT_SETTINGS.theme,
    backgroundMode: backgroundModeFrom(saved),
    glassEffect:
      GLASS_EFFECTS.find((effect) => effect === glassEffect) ?? DEFAULT_SETTINGS.glassEffect,
    liquidStrength:
      typeof liquidStrength === 'number'
        ? clampLiquidStrength(liquidStrength)
        : DEFAULT_SETTINGS.liquidStrength,
    blurPx: typeof blurPx === 'number' ? clampBlur(blurPx) : DEFAULT_SETTINGS.blurPx,
    wallpaperSource:
      WALLPAPER_SOURCES.find((source) => source === wallpaperSource) ??
      DEFAULT_SETTINGS.wallpaperSource,
    // Only plain stored names are kept, so a saved value can never point outside the folder.
    wallpaperFile: isWallpaperFileName(wallpaperFile) ? wallpaperFile : null,
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
      version: SETTINGS_VERSION,
      partialize: (state): AppSettings => ({
        theme: state.theme,
        backgroundMode: state.backgroundMode,
        glassEffect: state.glassEffect,
        liquidStrength: state.liquidStrength,
        blurPx: state.blurPx,
        wallpaperSource: state.wallpaperSource,
        wallpaperFile: state.wallpaperFile,
        dockAutoHide: state.dockAutoHide,
        dockMagnification: state.dockMagnification,
        dockIconSize: state.dockIconSize,
      }),
      migrate: (persisted) => sanitizeSettings(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
    },
  ),
);
