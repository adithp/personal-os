import type { Task } from '@personal-os/shared';
import { useEffect, useRef, type RefObject } from 'react';
import { usePalette } from '../../../store/palette-store';

export interface TaskShortcutHandlers {
  /** The element that holds all the task cards or rows. */
  rootRef: RefObject<HTMLElement | null>;
  /** Cards view moves Up and Down by grid row; List view by one task. */
  grid: boolean;
  getTask: (id: string) => Task | undefined;
  focusAdd: () => void;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Escape: close the detail panel (menus and the help popup close themselves). */
  onEscape: () => void;
  onHelp: () => void;
}

const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// The detail panel owns the keyboard while focus is in it (it handles Escape itself)
const POPUPS =
  '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="complementary"]';

const HANDLE = '[data-drag-handle]';

/** True when the key press happened somewhere typing or a popup owns the keyboard. */
function ownedElsewhere(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`${TYPING}, ${POPUPS}`) !== null;
}

/** The next task to focus from `current` for an arrow key, or null to stay put. */
export function nextItem(
  items: readonly HTMLElement[],
  current: HTMLElement,
  key: string,
  grid: boolean,
): HTMLElement | null {
  const index = items.indexOf(current);
  const step = key === 'ArrowRight' || (!grid && key === 'ArrowDown') ? 1 : -1;
  if (key === 'ArrowLeft' || key === 'ArrowRight' || !grid) {
    return items[index + step] ?? null;
  }
  // Cards: the card in the next row up or down that is closest to the same column
  const here = current.getBoundingClientRect();
  const down = key === 'ArrowDown';
  let best: HTMLElement | null = null;
  let bestRow = 0;
  let bestGap = 0;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (down ? rect.top <= here.top + 1 : rect.top >= here.top - 1) continue;
    const gap = Math.abs(rect.left - here.left);
    const nearer = down ? rect.top < bestRow : rect.top > bestRow;
    if (best === null || nearer || (rect.top === bestRow && gap < bestGap)) {
      best = item;
      bestRow = rect.top;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Keyboard shortcuts of My tasks. They work only on this page, not while typing (in a text box,
 * select, or editable text), not inside an open menu or dialog, not while the command palette is
 * open, and never with Ctrl, Meta, or Alt, so the global Ctrl shortcuts never clash.
 */
export function useTaskShortcuts(handlers: TaskShortcutHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (usePalette.getState().open) return;
      if (ownedElsewhere(event.target)) return;
      // The drag handle owns its keys (Space lifts and drops, arrows move, Esc cancels)
      if (event.target instanceof Element && event.target.closest(HANDLE) !== null) return;

      const { rootRef, grid, getTask, focusAdd, onToggle, onOpen, onDelete, onEscape, onHelp } =
        latest.current;
      const root = rootRef.current;
      const target = event.target instanceof Element ? event.target : null;
      const item = target?.closest<HTMLElement>('[data-item-key]') ?? null;
      const task = item?.dataset.taskId ? getTask(item.dataset.taskId) : undefined;
      const onItem = item !== null && target === item;
      const idle = target === null || target === document.body;

      switch (event.key) {
        case 'n':
        case 'N':
          // The key must not be typed into the box that is about to get focus
          event.preventDefault();
          focusAdd();
          return;
        case '?':
          event.preventDefault();
          onHelp();
          return;
        case 'Escape':
          onEscape();
          return;
        case ' ':
          if (!onItem || !task) return;
          event.preventDefault();
          if (!event.repeat) onToggle(task);
          return;
        case 'Enter':
          if (!onItem || !task) return;
          event.preventDefault();
          if (!event.repeat) onOpen(task);
          return;
        case 'Delete':
          if (!task) return;
          event.preventDefault();
          if (!event.repeat) onDelete(task);
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!root) return;
          const items = [...root.querySelectorAll<HTMLElement>('[data-item-key]')];
          if (items.length === 0) return;
          if (!item && !idle) return;
          const next = item
            ? nextItem(items, item, event.key, grid)
            : (root.querySelector<HTMLElement>('[data-item-key][tabindex="0"]') ??
              items[0] ??
              null);
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
