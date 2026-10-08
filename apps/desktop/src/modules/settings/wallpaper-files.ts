import {
  MAX_WALLPAPER_BYTES,
  WALLPAPER_DIR,
  WALLPAPER_EXTENSIONS,
  fileExtension,
  isWallpaperExtension,
  isWallpaperFileName,
} from '@personal-os/shared';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, copyFile, mkdir, remove, stat } from '@tauri-apps/plugin-fs';
import { isTauri } from '../../shell/use-tauri-window';

export type ChooseWallpaperResult =
  | { ok: true; file: string }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'type' | 'size' | 'failed' };

/**
 * Lets the user pick an image and copies it into the app's own data folder under a safe
 * generated name, so the original file is never touched and the app never needs to read it again.
 */
export async function chooseWallpaperImage(): Promise<ChooseWallpaperResult> {
  if (!isTauri()) return { ok: false, reason: 'unavailable' };

  try {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: [...WALLPAPER_EXTENSIONS] }],
    });
    if (picked === null) return { ok: false, reason: 'cancelled' };

    const extension = fileExtension(picked);
    if (!extension || !isWallpaperExtension(extension)) return { ok: false, reason: 'type' };

    const info = await stat(picked);
    if (info.size > MAX_WALLPAPER_BYTES) return { ok: false, reason: 'size' };

    const file = `wallpaper-${String(Date.now())}.${extension}`;
    await mkdir(WALLPAPER_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    await copyFile(picked, `${WALLPAPER_DIR}/${file}`, { toPathBaseDir: BaseDirectory.AppData });
    return { ok: true, file };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Deletes a stored wallpaper. Never throws: a missing file is fine. */
export async function removeWallpaperFile(file: string): Promise<void> {
  if (!isTauri() || !isWallpaperFileName(file)) return;
  try {
    await remove(`${WALLPAPER_DIR}/${file}`, { baseDir: BaseDirectory.AppData });
  } catch {
    // Already gone, or not allowed: nothing more to do.
  }
}

/** URL the page can load a stored wallpaper from, or null outside Tauri or for a bad name. */
export async function wallpaperUrl(file: string): Promise<string | null> {
  if (!isTauri() || !isWallpaperFileName(file)) return null;
  try {
    const path = await join(await appDataDir(), WALLPAPER_DIR, file);
    return convertFileSrc(path);
  } catch {
    return null;
  }
}
