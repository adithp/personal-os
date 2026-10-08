import { useCallback, useEffect, useRef, useState } from 'react';

/** The dock slides up when the cursor enters the bottom 28 px of the window. */
export const REVEAL_EDGE_PX = 28;

/** The dock hides this long after the cursor leaves it. */
export const HIDE_DELAY_MS = 400;

/**
 * Auto-hide for the dock. While `enabled` is false the dock is always visible.
 * Spread `dockHandlers` on the dock element so hovering it keeps it open.
 */
export function useDockAutoHide(enabled: boolean) {
  const [revealed, setRevealed] = useState(true);
  const nearEdge = useRef(false);
  const overDock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const evaluate = useCallback(() => {
    if (nearEdge.current || overDock.current) {
      clearTimer();
      setRevealed(true);
    } else {
      timer.current ??= setTimeout(() => {
        timer.current = undefined;
        setRevealed(false);
      }, HIDE_DELAY_MS);
    }
  }, [clearTimer]);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (event: MouseEvent) => {
      nearEdge.current = event.clientY >= window.innerHeight - REVEAL_EDGE_PX;
      evaluate();
    };
    const onLeaveWindow = () => {
      nearEdge.current = false;
      evaluate();
    };

    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeaveWindow);
    // The cursor is assumed to be away from the dock when auto-hide is switched on.
    evaluate();

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeaveWindow);
      clearTimer();
    };
  }, [enabled, evaluate, clearTimer]);

  const dockHandlers = {
    onMouseEnter: () => {
      overDock.current = true;
      evaluate();
    },
    onMouseLeave: () => {
      overDock.current = false;
      evaluate();
    },
  };

  return { visible: !enabled || revealed, dockHandlers };
}
