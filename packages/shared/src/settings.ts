import type { ThemeMode } from './modules';

/** Dock icon sizes in px (docs/DESIGN.md section 7). */
export const DOCK_ICON_SIZES = { small: 32, medium: 36, large: 44 } as const;
export type DockIconSize = keyof typeof DOCK_ICON_SIZES;

/** Window background modes (docs/DESIGN.md section 2). */
export const BACKGROUND_MODES = ['transparent', 'wallpaper', 'solid'] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/** Glass blur strength limits in px, used in Wallpaper mode (docs/DESIGN.md section 2). */
export const BLUR_RANGE = { min: 0, max: 40 } as const;

/** How glass panels look (docs/DESIGN.md "Liquid Glass"): refracting, plain blur, or solid. */
export const GLASS_EFFECTS = ['liquid', 'simple', 'off'] as const;
export type GlassEffect = (typeof GLASS_EFFECTS)[number];

/** Liquid Glass refraction strength, 0 (none) to 100 (strongest). */
export const LIQUID_STRENGTH_RANGE = { min: 0, max: 100 } as const;

/** Image for Wallpaper mode: the built-in gradient or an image the user uploaded. */
export const WALLPAPER_SOURCES = ['builtin', 'custom'] as const;
export type WallpaperSource = (typeof WALLPAPER_SOURCES)[number];

/** Image types accepted for an uploaded wallpaper. */
export const WALLPAPER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;

/** Largest uploaded wallpaper (20 MB). */
export const MAX_WALLPAPER_BYTES = 20 * 1024 * 1024;

/** Folder inside the app data directory that holds the uploaded wallpaper. */
export const WALLPAPER_DIR = 'wallpapers';

/** Name of a stored wallpaper file, e.g. wallpaper-1760000000000.png (no folders allowed). */
export function isWallpaperFileName(value: unknown): value is string {
  return typeof value === 'string' && /^wallpaper-\d{1,16}\.(png|jpe?g|webp)$/.test(value);
}

/** Lowercase file extension without the dot, or undefined when the name has none. */
export function fileExtension(name: string): string | undefined {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match?.[1]?.toLowerCase();
}

/** True for the image types an uploaded wallpaper may have. */
export function isWallpaperExtension(extension: string | undefined): boolean {
  return WALLPAPER_EXTENSIONS.some((allowed) => allowed === extension);
}

/** Device-local appearance and dock settings. Moves to the server in Step 3. */
export interface AppSettings {
  theme: ThemeMode;
  backgroundMode: BackgroundMode;
  glassEffect: GlassEffect;
  /** Refraction amount for the Liquid glass effect. */
  liquidStrength: number;
  blurPx: number;
  wallpaperSource: WallpaperSource;
  /** File name inside WALLPAPER_DIR, or null when nothing is uploaded. */
  wallpaperFile: string | null;
  dockAutoHide: boolean;
  dockMagnification: boolean;
  dockIconSize: DockIconSize;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  backgroundMode: 'transparent',
  glassEffect: 'liquid',
  liquidStrength: 50,
  blurPx: 24,
  wallpaperSource: 'builtin',
  wallpaperFile: null,
  dockAutoHide: false,
  dockMagnification: true,
  dockIconSize: 'medium',
};

export function clampLiquidStrength(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_SETTINGS.liquidStrength;
  return Math.min(
    LIQUID_STRENGTH_RANGE.max,
    Math.max(LIQUID_STRENGTH_RANGE.min, Math.round(value)),
  );
}

export function clampBlur(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_SETTINGS.blurPx;
  return Math.min(BLUR_RANGE.max, Math.max(BLUR_RANGE.min, Math.round(value)));
}
