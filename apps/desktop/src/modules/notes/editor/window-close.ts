import { getCurrentWindow } from '@tauri-apps/api/window';

/** Longest wait for the last save when the window is closing. */
export const CLOSE_FLUSH_TIMEOUT_MS = 3000;

function insideTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Runs `flush` when the window is asked to close, then closes it (memo notes.md D14, R5). Does
 * nothing outside the Tauri window (browser, tests). Returns a function that removes the listener.
 * Closing again after the flush needs no new permission: `core:window:allow-close` already exists.
 */
export function onWindowCloseFlush(flush: () => Promise<void>): () => void {
  if (!insideTauri()) return () => undefined;
  let unlisten: (() => void) | undefined;
  let removed = false;
  const win = getCurrentWindow();
  void win
    .onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        await Promise.race([
          flush(),
          new Promise<void>((resolve) => setTimeout(resolve, CLOSE_FLUSH_TIMEOUT_MS)),
        ]);
      } finally {
        // Without our listener the next close request goes through
        unlisten?.();
        await win.close();
      }
    })
    .then((remove) => {
      if (removed) remove();
      else unlisten = remove;
    });
  return () => {
    removed = true;
    unlisten?.();
  };
}
