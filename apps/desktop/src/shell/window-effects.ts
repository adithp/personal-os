import { Effect, getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from './use-tauri-window';

/**
 * Effects for the see-through window. Tauri applies the first one the system supports:
 * Acrylic (Windows 10 1903+ and Windows 11), then Mica (Windows 11).
 */
export const TRANSPARENT_EFFECTS = [Effect.Acrylic, Effect.Mica];

/**
 * Turns the see-through window effect on or off.
 * Returns false when the effect could not be applied (not in Tauri, unsupported, or an error).
 * Turning it off never counts as a failure.
 */
export async function setWindowEffect(enabled: boolean): Promise<boolean> {
  if (!isTauri()) return !enabled;
  const appWindow = getCurrentWindow();
  try {
    if (enabled) await appWindow.setEffects({ effects: TRANSPARENT_EFFECTS });
    else await appWindow.clearEffects();
    return true;
  } catch {
    return !enabled;
  }
}
