import type { ResolvedTheme, ThemeMode } from '@personal-os/shared';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/** Sets data-theme on the root element; tokens.css switches all colors from it. */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
}

/** Calls onChange whenever the OS switches between dark and light. Returns an unsubscribe function. */
export function subscribeToSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches);
  };
  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}

/** Applies the theme for a mode and follows the OS while the mode is "system". */
export function useApplyTheme(mode: ThemeMode): ResolvedTheme {
  // Only listen to the OS while the mode is "system"
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      mode === 'system' ? subscribeToSystemTheme(onStoreChange) : () => undefined,
    [mode],
  );
  const prefersDark = useSyncExternalStore(subscribe, systemPrefersDark);

  const theme = resolveTheme(mode, prefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return theme;
}
