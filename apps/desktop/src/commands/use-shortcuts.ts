import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { modulePath } from '../shell/module-paths';
import { usePalette } from '../store/palette-store';
import { actionForKeyPress } from './shortcuts';

/**
 * Listens for the app's keyboard shortcuts while a signed-in screen is open.
 * A matched key is cancelled (preventDefault), so Windows' own shortcut for it, such as
 * Ctrl J (downloads) or Ctrl 0 (zoom reset), does not also run.
 */
export function useShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const action = actionForKeyPress(event);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      if (action.type === 'palette') {
        usePalette.getState().toggle();
        return;
      }
      usePalette.getState().setOpen(false);
      void navigate({ to: modulePath(action.module) });
    };

    // Capture phase: runs before the page or a focused field can handle the key.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [navigate]);
}
