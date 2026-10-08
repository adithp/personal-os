import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';

/** True inside the Tauri window; false in a plain browser (tests, vite alone). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Minimize, maximize and close for the custom title bar. Does nothing outside Tauri. */
export function useTauriWindow() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const sync = () => {
      void appWindow.isMaximized().then((value) => {
        if (!cancelled) setMaximized(value);
      });
    };
    sync();
    void appWindow.onResized(sync).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const minimize = useCallback(() => {
    if (isTauri()) void getCurrentWindow().minimize();
  }, []);
  const toggleMaximize = useCallback(() => {
    if (isTauri()) void getCurrentWindow().toggleMaximize();
  }, []);
  const close = useCallback(() => {
    if (isTauri()) void getCurrentWindow().close();
  }, []);

  return { maximized, minimize, toggleMaximize, close };
}
