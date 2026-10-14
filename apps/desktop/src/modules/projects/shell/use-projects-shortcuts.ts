import { useEffect, useRef } from 'react';
import { usePalette } from '../../../store/palette-store';

export interface ProjectsShortcutHandlers {
  /** N: a new project (list), a new client (clients), nothing elsewhere. */
  onNew: () => void;
  /** Esc: back from a project or client page to its list. */
  onBack: () => void;
  onHelp: () => void;
}

// Same guards as the Tasks and Notes keys: typing, open menus and dialogs, and the palette own the keyboard
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const POPUPS = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';
const ROWS = '[data-project-row]';

/**
 * The plain-key shortcuts of the Projects page: N new, J and K (or the arrows) move between the
 * project or client cards, Enter opens the focused card (it is a button), Esc goes back, ? shows
 * the help. Never with Ctrl, Meta or Alt; not while typing, inside a menu or dialog, or while the
 * command palette is open.
 */
export function useProjectsShortcuts(handlers: ProjectsShortcutHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (usePalette.getState().open) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(`${TYPING}, ${POPUPS}`)) return;
      // A dialog or menu rendered elsewhere also owns the keyboard
      if (document.querySelector(POPUPS)) return;

      switch (event.key) {
        case 'n':
        case 'N':
          event.preventDefault();
          if (!event.repeat) latest.current.onNew();
          return;
        case '?':
          event.preventDefault();
          latest.current.onHelp();
          return;
        case 'Escape':
          latest.current.onBack();
          return;
        case 'j':
        case 'J':
        case 'k':
        case 'K':
        case 'ArrowDown':
        case 'ArrowUp': {
          const rows = [...document.querySelectorAll<HTMLElement>(ROWS)];
          if (rows.length === 0) return;
          const down = ['j', 'J', 'ArrowDown'].includes(event.key);
          const current = rows.findIndex((row) => row === document.activeElement);
          // Arrows only move when a card has focus (they scroll the page otherwise)
          if (current < 0 && event.key.startsWith('Arrow')) return;
          const next = current < 0 ? (down ? 0 : rows.length - 1) : current + (down ? 1 : -1);
          event.preventDefault();
          rows[Math.min(rows.length - 1, Math.max(0, next))]?.focus();
          return;
        }
        default:
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
