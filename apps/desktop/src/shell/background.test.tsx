import type * as TauriWindow from '@tauri-apps/api/window';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedInAuth } from '../test/fake-auth';
import { renderApp } from '../test/render-app';
import { useSettings } from '../store/settings-store';
import { useWindowEffect } from '../store/window-effect-store';
import { useBackground } from './use-background';
import { setWindowEffect, TRANSPARENT_EFFECTS } from './window-effects';

const appWindow = vi.hoisted(() => ({
  setEffects: vi.fn(),
  clearEffects: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: () => appWindow,
}));

function runInsideTauri() {
  Object.assign(window, { __TAURI_INTERNALS__: {} });
}

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  useWindowEffect.setState({ status: 'pending' });
  delete document.documentElement.dataset.background;
  vi.clearAllMocks();
  appWindow.setEffects.mockResolvedValue(undefined);
  appWindow.clearEffects.mockResolvedValue(undefined);
  appWindow.isMaximized.mockResolvedValue(false);
  appWindow.onResized.mockResolvedValue(vi.fn());
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  vi.unstubAllGlobals();
});

describe('setWindowEffect', () => {
  it('tries Acrylic first, then Mica', () => {
    expect(TRANSPARENT_EFFECTS).toEqual(['acrylic', 'mica']);
  });

  it('applies the effect inside Tauri', async () => {
    runInsideTauri();
    await expect(setWindowEffect(true)).resolves.toBe(true);
    expect(appWindow.setEffects).toHaveBeenCalledWith({ effects: ['acrylic', 'mica'] });
  });

  it('clears the effect inside Tauri', async () => {
    runInsideTauri();
    await expect(setWindowEffect(false)).resolves.toBe(true);
    expect(appWindow.clearEffects).toHaveBeenCalledOnce();
  });

  it('reports failure when Windows does not support the effect', async () => {
    runInsideTauri();
    appWindow.setEffects.mockRejectedValueOnce(new Error('unsupported'));
    await expect(setWindowEffect(true)).resolves.toBe(false);
  });

  it('never counts a failed clear as a failure for the fallback', async () => {
    runInsideTauri();
    appWindow.clearEffects.mockRejectedValueOnce(new Error('nothing to clear'));
    await expect(setWindowEffect(false)).resolves.toBe(true);
  });

  it('reports failure for the see-through effect outside Tauri', async () => {
    await expect(setWindowEffect(true)).resolves.toBe(false);
    await expect(setWindowEffect(false)).resolves.toBe(true);
    expect(appWindow.setEffects).not.toHaveBeenCalled();
  });
});

describe('useBackground', () => {
  it('shows Transparent when the effect works', async () => {
    runInsideTauri();
    const { result } = renderHook(() => useBackground('transparent'));
    await waitFor(() => {
      expect(useWindowEffect.getState().status).toBe('ok');
    });
    expect(result.current).toBe('transparent');
  });

  it('falls back to Wallpaper automatically when the effect fails', async () => {
    runInsideTauri();
    appWindow.setEffects.mockRejectedValue(new Error('unsupported'));
    const { result } = renderHook(() => useBackground('transparent'));
    await waitFor(() => {
      expect(result.current).toBe('wallpaper');
    });
    expect(useWindowEffect.getState().status).toBe('failed');
  });

  it.each(['wallpaper', 'solid'] as const)('keeps %s and clears the effect', async (mode) => {
    runInsideTauri();
    const { result } = renderHook(() => useBackground(mode));
    await waitFor(() => {
      expect(appWindow.clearEffects).toHaveBeenCalled();
    });
    expect(result.current).toBe(mode);
    expect(appWindow.setEffects).not.toHaveBeenCalled();
  });

  it('retries the effect when switching back to Transparent', async () => {
    runInsideTauri();
    appWindow.setEffects.mockRejectedValueOnce(new Error('temporary'));
    const { result, rerender } = renderHook(({ mode }) => useBackground(mode), {
      initialProps: { mode: 'transparent' as 'transparent' | 'solid' },
    });
    await waitFor(() => {
      expect(result.current).toBe('wallpaper');
    });

    rerender({ mode: 'solid' });
    await waitFor(() => {
      expect(result.current).toBe('solid');
    });

    rerender({ mode: 'transparent' });
    await waitFor(() => {
      expect(result.current).toBe('transparent');
    });
  });
});

describe('background in the app', () => {
  it('is Transparent by default: a tint layer over a see-through page', async () => {
    runInsideTauri();
    await renderApp('/tasks', signedInAuth().auth);
    await waitFor(() => {
      expect(useWindowEffect.getState().status).toBe('ok');
    });

    const layer = screen.getByTestId('background');
    expect(layer).toHaveAttribute('data-mode', 'transparent');
    expect(layer).toHaveStyle({ background: 'var(--tint)' });
    expect(document.documentElement.dataset.background).toBe('transparent');
    expect(appWindow.setEffects).toHaveBeenCalledWith({ effects: ['acrylic', 'mica'] });
  });

  it('uses the gradient in Wallpaper mode and clears the effect', async () => {
    runInsideTauri();
    useSettings.getState().update({ backgroundMode: 'wallpaper' });
    await renderApp('/tasks', signedInAuth().auth);

    expect(screen.getByTestId('background')).toHaveAttribute('data-mode', 'wallpaper');
    expect(screen.getByTestId('background')).toHaveStyle({
      background: 'var(--wallpaper-default)',
    });
    expect(document.documentElement.dataset.background).toBe('wallpaper');
    await waitFor(() => {
      expect(appWindow.clearEffects).toHaveBeenCalled();
    });
  });

  it('uses the plain bg color in Solid mode', async () => {
    useSettings.getState().update({ backgroundMode: 'solid' });
    await renderApp('/tasks', signedInAuth().auth);

    const layer = screen.getByTestId('background');
    expect(layer).toHaveAttribute('data-mode', 'solid');
    expect(layer).toHaveClass('bg-bg');
    expect(layer.style.background).toBe('');
  });

  it('switches mode live when the setting changes', async () => {
    runInsideTauri();
    await renderApp('/tasks', signedInAuth().auth);
    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveAttribute('data-mode', 'transparent');
    });

    act(() => {
      useSettings.getState().update({ backgroundMode: 'solid' });
    });
    expect(screen.getByTestId('background')).toHaveAttribute('data-mode', 'solid');
    expect(document.documentElement.dataset.background).toBe('solid');
  });

  it('falls back to Wallpaper on a PC where Acrylic fails, but keeps the saved choice', async () => {
    runInsideTauri();
    appWindow.setEffects.mockRejectedValue(new Error('unsupported'));
    await renderApp('/tasks', signedInAuth().auth);

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveAttribute('data-mode', 'wallpaper');
    });
    expect(document.documentElement.dataset.background).toBe('wallpaper');
    expect(useSettings.getState().backgroundMode).toBe('transparent');
  });

  it('falls back to Wallpaper outside Tauri (browser)', async () => {
    await renderApp('/tasks', signedInAuth().auth);
    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveAttribute('data-mode', 'wallpaper');
    });
  });
});
