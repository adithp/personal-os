import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterScale } from './displacement-map';
import type { LiquidSupport } from './support';
import { useLiquidGlass } from './use-liquid-glass';

class FakeResizeObserver {
  observe() {
    /* layout is not measured in these tests */
  }
  unobserve() {
    /* layout is not measured in these tests */
  }
  disconnect() {
    /* layout is not measured in these tests */
  }
}

const supported = (): LiquidSupport => ({ supported: true });
const unsupported = (): LiquidSupport => ({ supported: false, reason: 'not-chromium' });

const svg = () => document.querySelector('[data-liquid-glass-defs]');

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  // jsdom has no canvas: drawing a map fails, like a browser without canvas support
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  delete document.documentElement.dataset.glass;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useLiquidGlass', () => {
  it('shows Liquid when it is chosen and supported, and starts the engine', () => {
    const { result } = renderHook(() => useLiquidGlass('liquid', 50, supported));
    expect(result.current).toMatchObject({ effective: 'liquid', unavailable: false });
    expect(document.documentElement.dataset.glass).toBe('liquid');
    expect(svg()).not.toBeNull();
  });

  it('falls back to Simple automatically when Liquid is not supported', () => {
    const { result } = renderHook(() => useLiquidGlass('liquid', 50, unsupported));
    expect(result.current).toMatchObject({ effective: 'simple', unavailable: true });
    expect(result.current.support).toEqual({ supported: false, reason: 'not-chromium' });
    expect(document.documentElement.dataset.glass).toBe('simple');
    expect(svg()).toBeNull();
  });

  it.each(['simple', 'off'] as const)('shows %s as chosen, without the engine', (choice) => {
    const { result } = renderHook(() => useLiquidGlass(choice, 50, supported));
    expect(result.current).toMatchObject({ effective: choice, unavailable: false });
    expect(document.documentElement.dataset.glass).toBe(choice);
    expect(svg()).toBeNull();
  });

  it('does not report Simple as unavailable on a browser without Liquid', () => {
    const { result } = renderHook(() => useLiquidGlass('simple', 50, unsupported));
    expect(result.current).toMatchObject({ effective: 'simple', unavailable: false });
  });

  it('starts and stops the engine as the choice changes', () => {
    const { rerender } = renderHook(({ choice }) => useLiquidGlass(choice, 50, supported), {
      initialProps: { choice: 'liquid' as 'liquid' | 'simple' | 'off' },
    });
    expect(svg()).not.toBeNull();

    rerender({ choice: 'off' });
    expect(document.documentElement.dataset.glass).toBe('off');
    expect(svg()).toBeNull();

    rerender({ choice: 'liquid' });
    expect(document.documentElement.dataset.glass).toBe('liquid');
    expect(svg()).not.toBeNull();
  });

  it('removes the engine when unmounted', () => {
    const { unmount } = renderHook(() => useLiquidGlass('liquid', 50, supported));
    expect(svg()).not.toBeNull();
    unmount();
    expect(svg()).toBeNull();
  });

  it('applies strength changes to the filters without restarting', async () => {
    // A glass element with a fake size so a filter exists
    const region = document.createElement('div');
    region.setAttribute('data-glass', 'liquid');
    const el = document.createElement('div');
    el.className = 'glass';
    Object.defineProperty(el, 'offsetWidth', { value: 300 });
    Object.defineProperty(el, 'offsetHeight', { value: 160 });
    region.appendChild(el);
    document.body.appendChild(region);

    // Maps can be drawn in this test
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,X');
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );

    const { rerender } = renderHook(
      ({ strength }) => useLiquidGlass('liquid', strength, supported),
      {
        initialProps: { strength: 50 },
      },
    );
    await waitFor(() => {
      expect(document.querySelector('feDisplacementMap')).not.toBeNull();
    });
    expect(document.querySelector('feDisplacementMap')?.getAttribute('scale')).toBe(
      String(filterScale(50)),
    );

    rerender({ strength: 90 });
    expect(document.querySelector('feDisplacementMap')?.getAttribute('scale')).toBe(
      String(filterScale(90)),
    );
  });

  it('falls back to Simple when the engine cannot draw its maps', async () => {
    const region = document.createElement('div');
    region.setAttribute('data-glass', 'liquid');
    const el = document.createElement('div');
    el.className = 'glass';
    Object.defineProperty(el, 'offsetWidth', { value: 300 });
    Object.defineProperty(el, 'offsetHeight', { value: 160 });
    region.appendChild(el);
    document.body.appendChild(region);

    const { result } = renderHook(() => useLiquidGlass('liquid', 50, supported));
    await waitFor(() => {
      expect(result.current.effective).toBe('simple');
    });
    expect(result.current.unavailable).toBe(true);
    expect(document.documentElement.dataset.glass).toBe('simple');
    expect(svg()).toBeNull();
  });
});
