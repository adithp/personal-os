import { useRef, useState, type KeyboardEvent } from 'react';

/**
 * One Tab stop for a list of rows. The row marked `data-roving` that was used last is the one Tab
 * reaches; Arrow Up and Down, Home and End move between rows (Enter and Space work on the buttons
 * themselves). Spread `listProps` on the list and `itemProps(i)` on each row's button.
 */
export function useRovingList(count: number) {
  const [active, setActive] = useState(0);
  const list = useRef<HTMLElement | null>(null);
  const current = Math.min(active, Math.max(count - 1, 0));

  const move = (next: number) => {
    setActive(next);
    list.current?.querySelectorAll<HTMLElement>('[data-roving]')[next]?.focus();
  };

  return {
    listProps: {
      ref: (element: HTMLElement | null) => {
        list.current = element;
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (!(event.target instanceof Element) || !event.target.hasAttribute('data-roving')) return;
        if (count === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
        const next =
          event.key === 'ArrowDown'
            ? Math.min(current + 1, count - 1)
            : event.key === 'ArrowUp'
              ? Math.max(current - 1, 0)
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? count - 1
                  : null;
        if (next === null) return;
        event.preventDefault();
        move(next);
      },
    },
    itemProps: (index: number) => ({
      'data-roving': '',
      tabIndex: index === current ? 0 : -1,
      onFocus: () => {
        setActive(index);
      },
    }),
  };
}
