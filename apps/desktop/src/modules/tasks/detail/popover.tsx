import { cx } from '@personal-os/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface PopoverProps {
  /** Name of the button that opens the popup. */
  label: string;
  /** Name of the popup. */
  popupLabel: string;
  /** What the button shows. */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Turns the button off. */
  disabled?: boolean;
  /** The popup content; call `close` to close it and return focus to the button. */
  children: (close: () => void) => ReactNode;
}

const ITEMS = '[role="menuitemcheckbox"],[role="menuitemradio"],[role="menuitem"]';

/**
 * A small popup built with plain React. Escape closes it (and is swallowed, so the panel stays
 * open), so does leaving it with Tab or a click outside. Arrow keys move between its items.
 */
export function Popover({
  label,
  popupLabel,
  trigger,
  triggerClassName,
  disabled,
  children,
}: PopoverProps) {
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
      popup.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      popup.current?.querySelector<HTMLElement>(ITEMS);
    first?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!open || !(event.target instanceof HTMLElement) || event.target.tagName === 'INPUT') return;
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
      className="relative inline-block max-w-full"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={cx('max-w-full rounded-[8px] focus-ring', triggerClassName)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={popup}
          id={id}
          role="menu"
          aria-label={popupLabel}
          tabIndex={-1}
          className="absolute top-full left-0 z-30 mt-1 flex min-w-[200px] flex-col gap-1 rounded-card glass-strong p-1.5"
        >
          {/* close only touches the button ref when called from an event */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export interface PopoverItemProps {
  role: 'menuitemcheckbox' | 'menuitemradio' | 'menuitem';
  checked?: boolean;
  onSelect: () => void;
  'aria-label'?: string;
  className?: string;
  children?: ReactNode;
}

/** One choice inside a popup. It is reached with the arrow keys, not Tab. */
export function PopoverItem({
  role,
  checked,
  onSelect,
  className,
  children,
  ...aria
}: PopoverItemProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'menuitem' ? undefined : checked}
      tabIndex={-1}
      onClick={onSelect}
      className={cx(
        'flex h-7 items-center gap-2 rounded-[8px] px-2 text-left text-body text-fg focus-ring hover:bg-input focus-visible:bg-input',
        className,
      )}
      {...aria}
    >
      {children}
    </button>
  );
}
