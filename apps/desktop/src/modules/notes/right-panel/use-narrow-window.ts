import { useEffect, useState } from 'react';

/** Below this width the open right panel makes the side panel show icons only (memo notes.md D4). */
export const NARROW_WINDOW_PX = 1252;

const QUERY = `(max-width: ${String(NARROW_WINDOW_PX - 0.02)}px)`;

/** True while the window is narrower than 1252 px. */
export function useNarrowWindow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => {
      setNarrow(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, []);

  return narrow;
}
