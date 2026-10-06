import type { ThemeMode } from './modules';

/** Dock icon sizes in px (docs/DESIGN.md section 7). */
export const DOCK_ICON_SIZES = { small: 32, medium: 36, large: 44 } as const;
export type DockIconSize = keyof typeof DOCK_ICON_SIZES;

/** Window background modes (docs/DESIGN.md section 2). */
export const BACKGROUND_MODES = ['transparent', 'wallpaper', 'solid'] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/** Glass blur strength limits in px, used in Wallpaper mode (docs/DESIGN.md section 2). */
export const BLUR_RANGE = { min: 0, max: 40 } as const;

/** Device-local appearance and dock settings. Moves to the server in Step 3. */
export interface AppSettings {
  theme: ThemeMode;
  backgroundMode: BackgroundMode;
  blurPx: number;
  dockAutoHide: boolean;
  dockMagnification: boolean;
  dockIconSize: DockIconSize;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  backgroundMode: 'transparent',
  blurPx: 24,
  dockAutoHide: false,
  dockMagnification: true,
  dockIconSize: 'medium',
};

export function clampBlur(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_SETTINGS.blurPx;
  return Math.min(BLUR_RANGE.max, Math.max(BLUR_RANGE.min, Math.round(value)));
}
