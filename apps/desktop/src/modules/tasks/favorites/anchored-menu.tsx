import { cx } from '@personal-os/ui';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const ITEMS = '[role="menuitemradio"],[role="menuitem"]';
const WIDTH = 224;
const MAX_HEIGHT = 360;

export interface AnchoredMenuProps {
  /** The element the menu opens from (it also gets the focus back on close). */
  anchor: HTMLElement;
  /** The name of the menu. */
  label: string;
  /** Line the menu up with the left or the right edge of the anchor. */
  align?: 'start' | 'end';
  /** `returnFocus` is true after Escape, Tab or a choice, false after a click outside. */
  onClose: (returnFocus: boolean) => void;
  children: ReactNode;
}

function placement(anchor: HTMLElement, align: 'start' | 'end') {
  const rect = anchor.getBoundingClientRect();
  const wanted = align === 'end' ? rect.right - WIDTH : rect.left;
  const left = Math.max(8, Math.min(wanted, window.innerWidth - WIDTH - 8));
  const flip =
    rect.bottom + MAX_HEIGHT + 8 > window.innerHeight && rect.top > window.innerHeight / 2;
  return flip
    ? { left, bottom: window.innerHeight - rect.top + 4 }
    : { left, top: rect.bottom + 4 };
}

/**
 * A small glass menu drawn above the page (so the side panel's scrolling cannot clip it). Arrow
 * keys move between items, Escape and Tab close it and give the focus back, a click outside closes it.
 */
export function AnchoredMenu({
  anchor,
  label,
  align = 'start',
  onClose,
  children,
}: AnchoredMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [position] = useState(() => placement(anchor, align));

  useEffect(() => {
    const first =
      panel.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      panel.current?.querySelector<HTMLElement>(ITEMS);
    first?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (panel.current?.contains(event.target) || anchor.contains(event.target)) return;
      onClose(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
    // Only on open: the menu is mounted when it opens and unmounted when it closes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    if (items.length === 0 || !(event.target instanceof HTMLElement)) return;
    const typing = event.target.tagName === 'INPUT';
    const index = items.indexOf(event.target);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = typing ? 0 : (index + 1) % items.length;
    else if (event.key === 'ArrowUp' && !typing) next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home' && !typing) next = 0;
    else if (event.key === 'End' && !typing) next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return createPortal(
    <div
      ref={panel}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ ...position, width: WIDTH, maxHeight: MAX_HEIGHT }}
      className="fixed z-50 flex flex-col gap-1 overflow-y-auto rounded-card glass-strong p-1.5"
    >
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItemProps {
  role?: 'menuitem' | 'menuitemradio';
  checked?: boolean;
  /** Looks off and does nothing, but can still be reached and read (with `describedBy`). */
  disabled?: boolean;
  describedBy?: string;
  'aria-label'?: string;
  className?: string;
  onSelect: () => void;
  children: ReactNode;
}

/** One choice in a menu. Reached with the arrow keys, not Tab. */
export function MenuItem({
  role = 'menuitem',
  checked,
  disabled,
  describedBy,
  className,
  onSelect,
  children,
  ...aria
}: MenuItemProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'menuitemradio' ? checked === true : undefined}
      aria-disabled={disabled ? true : undefined}
      aria-describedby={describedBy}
      tabIndex={-1}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      className={cx(
        'flex h-7 shrink-0 items-center gap-2 rounded-[8px] px-2 text-left text-body text-fg focus-ring hover:bg-input focus-visible:bg-input',
        disabled && 'cursor-default text-fg-muted opacity-60 hover:bg-transparent',
        className,
      )}
      {...aria}
    >
      {children}
    </button>
  );
}

/** A round swatch or a square glyph button with a check when chosen (color and icon pickers). */
export function CheckMark({ shown }: { shown: boolean }) {
  return shown ? <IconCheck size={12} aria-hidden /> : null;
}
