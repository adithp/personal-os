import { useEffect, useRef, type RefObject } from 'react';
import { usePalette } from '../../store/palette-store';

export interface HabitShortcutHandlers {
  /** The element that holds all the habit rows. */
  rootRef: RefObject<HTMLElement | null>;
  onNew: () => void;
  /** Space on a row. */
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onEscape: () => void;
  onHelp: () => void;
}

const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// The detail panel owns the keyboard while focus is in it (it handles Escape itself)
const POPUPS =
  '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="complementary"]';

/**
 * Keyboard shortcuts of the Habits page. They work only on this page, not while typing, not inside
 * an open dialog or the detail panel, not while the command palette is open, and never with Ctrl,
 * Meta, or Alt (the global shortcuts keep working).
 */
export function useHabitShortcuts(handlers: HabitShortcutHandlers): void {
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

      const { rootRef, onNew, onToggle, onOpen, onEdit, onEscape, onHelp } = latest.current;
      const item = target?.closest<HTMLElement>('[data-item-key]') ?? null;
      const id = item?.dataset.habitId;
      const onItem = item !== null && target === item;
      const idle = target === null || target === document.body;

      switch (event.key) {
        case 'n':
        case 'N':
          event.preventDefault();
          onNew();
          return;
        case '?':
          event.preventDefault();
          onHelp();
          return;
        case 'Escape':
          onEscape();
          return;
        case ' ':
          if (!onItem || !id) return;
          event.preventDefault();
          if (!event.repeat) onToggle(id);
          return;
        case 'Enter':
          if (!onItem || !id) return;
          event.preventDefault();
          if (!event.repeat) onOpen(id);
          return;
        case 'e':
        case 'E':
          if (!id) return;
          event.preventDefault();
          onEdit(id);
          return;
        case 'ArrowUp':
        case 'ArrowDown': {
          const root = rootRef.current;
          if (!root || (!item && !idle)) return;
          const items = [...root.querySelectorAll<HTMLElement>('[data-item-key]')];
          if (items.length === 0) return;
          const next = item
            ? items[items.indexOf(item) + (event.key === 'ArrowDown' ? 1 : -1)]
            : (root.querySelector<HTMLElement>('[data-item-key][tabindex="0"]') ?? items[0]);
          event.preventDefault();
          if (next) {
            next.focus();
            next.scrollIntoView({ block: 'nearest' });
          }
          return;
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
