import type { BackgroundMode } from '@personal-os/shared';
import { useEffect } from 'react';
import { useWindowEffect } from '../store/window-effect-store';
import { setWindowEffect } from './window-effects';

/**
 * The background that is actually shown. Applies or clears the see-through window effect for
 * the chosen mode, and falls back to Wallpaper when Transparent was chosen but the effect
 * is not supported or fails. The saved choice is not changed.
 */
export function useBackground(chosen: BackgroundMode): BackgroundMode {
  const status = useWindowEffect((state) => state.status);
  const setStatus = useWindowEffect((state) => state.setStatus);

  useEffect(() => {
    let cancelled = false;
    const wantsEffect = chosen === 'transparent';
    if (wantsEffect) setStatus('pending');

    void setWindowEffect(wantsEffect).then((ok) => {
      if (cancelled || !wantsEffect) return;
      setStatus(ok ? 'ok' : 'failed');
    });

    return () => {
      cancelled = true;
    };
  }, [chosen, setStatus]);

  if (chosen === 'transparent' && status === 'failed') return 'wallpaper';
  return chosen;
}
