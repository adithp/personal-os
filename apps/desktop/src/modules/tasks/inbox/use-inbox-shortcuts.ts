import type { Task, TaskPriority } from '@personal-os/shared';
import { useEffect, useRef } from 'react';
import { usePalette } from '../../../store/palette-store';

export interface InboxShortcutHandlers {
  getTask: (id: string) => Task | undefined;
  onPriority: (task: Task, priority: TaskPriority) => void;
}

// Same guards as the My tasks keys (use-task-shortcuts.ts): typing and open popups own the keyboard
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const POPUPS =
  '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="complementary"]';

const PRIORITY_KEYS: Record<string, TaskPriority> = { '1': 1, '2': 2, '3': 3, '4': 4 };

/**
 * The Inbox-only keys, on the focused row: T opens its date menu, L its tag picker, 1 to 4 set the
 * priority (Urgent to Low). Never with Ctrl, Meta or Alt; not while typing, in a menu, a dialog,
 * the detail panel, or the command palette.
 */
export function useInboxShortcuts(handlers: InboxShortcutHandlers): void {
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
      // Only the row itself (not a button inside it, not the drag handle)
      const item = target?.closest<HTMLElement>('[data-item-key]') ?? null;
      if (!item || target !== item) return;
      const task = item.dataset.taskId ? latest.current.getTask(item.dataset.taskId) : undefined;
      if (!task) return;

      const key = event.key.toLowerCase();
      if (key === 't' || key === 'l') {
        event.preventDefault();
        item.querySelector<HTMLElement>(`[data-quick="${key === 't' ? 'date' : 'tag'}"]`)?.click();
        return;
      }
      const priority = PRIORITY_KEYS[event.key];
      if (priority !== undefined) {
        event.preventDefault();
        if (!event.repeat && task.priority !== priority) latest.current.onPriority(task, priority);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
