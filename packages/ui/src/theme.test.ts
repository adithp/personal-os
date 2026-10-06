import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, resolveTheme, subscribeToSystemTheme, useApplyTheme } from './theme';

type Listener = (event: MediaQueryListEvent) => void;

/** Fake OS color scheme that tests can flip. */
function mockSystemTheme(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<Listener>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    })),
  );
  return {
    setDark(dark: boolean) {
      matches = dark;
      for (const listener of listeners) listener({ matches: dark } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('returns explicit modes as they are', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('follows the OS in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets data-theme on the root element', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('subscribeToSystemTheme', () => {
  it('reports OS changes until unsubscribed', () => {
    const system = mockSystemTheme(true);
    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(onChange);

    system.setDark(false);
    expect(onChange).toHaveBeenLastCalledWith(false);

    unsubscribe();
    expect(system.listenerCount()).toBe(0);
  });
});

describe('useApplyTheme', () => {
  it('applies an explicit mode', () => {
    mockSystemTheme(true);
    const { result } = renderHook(() => useApplyTheme('light'));
    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('follows the OS live in system mode', () => {
    const system = mockSystemTheme(true);
    const { result } = renderHook(() => useApplyTheme('system'));
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => {
      system.setDark(false);
    });
    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('stops following the OS after switching to an explicit mode', () => {
    const system = mockSystemTheme(true);
    const { rerender } = renderHook(({ mode }) => useApplyTheme(mode), {
      initialProps: { mode: 'system' as 'system' | 'dark' },
    });
    expect(system.listenerCount()).toBe(1);

    rerender({ mode: 'dark' });
    expect(system.listenerCount()).toBe(0);

    act(() => {
      system.setDark(false);
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
