import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDE_DELAY_MS, REVEAL_EDGE_PX, useDockAutoHide } from './use-dock-auto-hide';

function moveCursorTo(clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientY }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDockAutoHide', () => {
  it('is always visible when auto-hide is off', () => {
    const { result } = renderHook(() => useDockAutoHide(false));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.visible).toBe(true);
  });

  it('uses the documented numbers', () => {
    expect(REVEAL_EDGE_PX).toBe(28);
    expect(HIDE_DELAY_MS).toBe(400);
  });

  it('hides 400 ms after auto-hide is switched on', () => {
    const { result } = renderHook(() => useDockAutoHide(true));
    expect(result.current.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS - 1);
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.visible).toBe(false);
  });

  it('slides up when the cursor enters the bottom 28 px', () => {
    const { result } = renderHook(() => useDockAutoHide(true));
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS);
    });
    expect(result.current.visible).toBe(false);

    moveCursorTo(window.innerHeight - REVEAL_EDGE_PX - 1);
    expect(result.current.visible).toBe(false);

    moveCursorTo(window.innerHeight - REVEAL_EDGE_PX);
    expect(result.current.visible).toBe(true);
  });

  it('hides 400 ms after the cursor leaves the bottom edge', () => {
    const { result } = renderHook(() => useDockAutoHide(true));
    moveCursorTo(window.innerHeight - 5);
    expect(result.current.visible).toBe(true);

    moveCursorTo(window.innerHeight / 2);
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS - 1);
    });
    expect(result.current.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.visible).toBe(false);
  });

  it('stays open while the cursor is over the dock', () => {
    const { result } = renderHook(() => useDockAutoHide(true));
    moveCursorTo(window.innerHeight - 5);
    act(() => {
      result.current.dockHandlers.onMouseEnter();
    });
    moveCursorTo(window.innerHeight - 100); // above the 28 px edge but still over the dock

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      result.current.dockHandlers.onMouseLeave();
    });
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS);
    });
    expect(result.current.visible).toBe(false);
  });

  it('cancels a pending hide when the cursor comes back', () => {
    const { result } = renderHook(() => useDockAutoHide(true));
    moveCursorTo(window.innerHeight - 5);
    moveCursorTo(100);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    moveCursorTo(window.innerHeight - 5);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.visible).toBe(true);
  });

  it('hides after the cursor leaves the window', () => {
    const { result } = renderHook(() => useDockAutoHide(true));
    moveCursorTo(window.innerHeight - 5);
    act(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(HIDE_DELAY_MS);
    });
    expect(result.current.visible).toBe(false);
  });

  it('stops listening after it is turned off', () => {
    const { result, rerender } = renderHook(({ on }) => useDockAutoHide(on), {
      initialProps: { on: true },
    });
    act(() => {
      vi.advanceTimersByTime(HIDE_DELAY_MS);
    });
    expect(result.current.visible).toBe(false);

    rerender({ on: false });
    expect(result.current.visible).toBe(true);
  });
});
