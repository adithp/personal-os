import { useEffect, useRef } from 'react';
import { usePalette } from '../../../store/palette-store';
import { useMoneyUi } from '../money-ui-store';
import { useMoneyNav } from '../use-money-nav';

export interface MoneyKeyOptions {
  /** N: open the add form of this page. Left out when the page has nothing to add. */
  onNew?: () => void;
  /** The page shows one month: [ and ] step it. */
  months?: boolean;
}

// Same guards as the Tasks and Notes keys: typing, open menus and dialogs, and the palette own the keyboard
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const POPUPS = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';

/**
 * The plain-key shortcuts of a Money page: N adds, [ and ] step the month, ? shows the help.
 * Never with Ctrl, Meta or Alt; not while typing, not inside a dialog or menu, and not while the
 * command palette is open. Every Money page calls this once.
 */
export function useMoneyKeys(options: MoneyKeyOptions): void {
  const { stepMonth } = useMoneyNav();
  const latest = useRef({ ...options, stepMonth });
  useEffect(() => {
    latest.current = { ...options, stepMonth };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (usePalette.getState().open) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(`${TYPING}, ${POPUPS}`)) return;
      if (useMoneyUi.getState().helpOpen) return;

      const { onNew, months, stepMonth: step } = latest.current;
      switch (event.key) {
        case 'n':
        case 'N':
          if (!onNew) return;
          event.preventDefault();
          if (!event.repeat) onNew();
          return;
        case '[':
        case ']':
          if (!months) return;
          event.preventDefault();
          step(event.key === '[' ? -1 : 1);
          return;
        case '?':
          event.preventDefault();
          useMoneyUi.getState().setHelpOpen(true);
          return;
        default:
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
