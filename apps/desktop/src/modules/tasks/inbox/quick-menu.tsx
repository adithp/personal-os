import { cx, Tooltip } from '@personal-os/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export const QUICK_BUTTON =
  'inline-flex size-7 items-center justify-center rounded-chip text-fg-muted focus-ring transition-colors duration-150 ease-out hover:bg-tint hover:text-fg motion-reduce:transition-none';

export interface QuickMenuProps {
  /** Name of the button and of the tooltip. */
  label: string;
  popupLabel: string;
  icon: ReactNode;
  /** Marks the button so the page can open the menu from a key (data-quick="date"). */
  kind: string;
  /** 0 only on the row that is the Tab stop of the list; -1 on the others. */
  tabIndex: 0 | -1;
  children: (close: () => void) => ReactNode;
}

const ITEMS = '[role="menuitemradio"],[role="menuitem"]';

/**
 * A quick-action icon button with a small popup under it, aligned to the right edge of the row.
 * Escape closes it (focus returns to the button), so does leaving it. Arrow keys move between items.
 */
export function QuickMenu({ label, popupLabel, icon, kind, tabIndex, children }: QuickMenuProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const first =
      popup.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      popup.current?.querySelector<HTMLElement>(ITEMS);
    first?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!(event.target instanceof HTMLElement) || event.target.tagName === 'INPUT') return;
    const items = [...(popup.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const index = items.indexOf(event.target);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    if (next === null || items.length === 0) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <div
      className="relative inline-flex"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Tooltip label={label}>
        <button
          ref={button}
          type="button"
          data-quick={kind}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={label}
          tabIndex={tabIndex}
          onClick={() => {
            setOpen((value) => !value);
          }}
          className={cx(QUICK_BUTTON, open && 'bg-tint text-fg')}
        >
          {icon}
        </button>
      </Tooltip>
      {open ? (
        <div
          ref={popup}
          id={id}
          role="menu"
          aria-label={popupLabel}
          tabIndex={-1}
          className="absolute top-full right-0 z-30 mt-1 flex min-w-[200px] flex-col gap-1 rounded-card glass-strong p-1.5"
        >
          {/* close only touches the button ref when called from an event */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

/** One choice inside a quick menu. It is reached with the arrow keys, not Tab. */
export function QuickItem({
  role = 'menuitem',
  checked,
  onSelect,
  children,
}: {
  role?: 'menuitem' | 'menuitemradio';
  checked?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'menuitemradio' ? checked === true : undefined}
      tabIndex={-1}
      onClick={onSelect}
      className="flex h-7 items-center gap-2 rounded-[8px] px-2 text-left text-body text-fg focus-ring hover:bg-input focus-visible:bg-input"
    >
      {children}
    </button>
  );
}
