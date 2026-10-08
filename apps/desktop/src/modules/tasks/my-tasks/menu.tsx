import { cx } from '@personal-os/ui';
import { IconCheck } from '@tabler/icons-react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

const MenuContext = createContext<{ close: () => void }>({ close: () => undefined });

export interface MenuProps {
  /** The button's name and the menu's name, e.g. "Filter". */
  label: string;
  /** Quiet text after the label, e.g. the current choice. Hidden from screen readers. */
  detail?: string;
  children: ReactNode;
}

const ITEMS = '[role="menuitemradio"],[role="menuitemcheckbox"],[role="menuitem"]';

/**
 * A small popup menu built with plain React: opens from a button, moves with the arrow keys,
 * closes on Escape (focus returns to the button), on a click outside, and on Tab.
 */
export function Menu({ label, detail, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items = panel.current?.querySelectorAll<HTMLElement>(ITEMS);
    const checked = panel.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          'inline-flex h-[30px] items-center gap-1.5 rounded-control px-3 text-body text-fg-secondary focus-ring',
          'transition-colors duration-150 ease-out hover:bg-input hover:text-fg',
          open && 'bg-input text-fg',
        )}
      >
        <span aria-hidden>{label}</span>
        {detail ? (
          <span aria-hidden className="text-small text-fg-muted">
            {detail}
          </span>
        ) : null}
      </button>
      {open ? (
        <MenuContext.Provider
          value={{
            close: () => {
              close(true);
            },
          }}
        >
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="absolute top-full left-0 z-30 mt-1 flex min-w-[210px] flex-col gap-1 rounded-card border-[0.5px] border-glass-border glass-strong p-1.5"
          >
            {children}
          </div>
        </MenuContext.Provider>
      ) : null}
    </div>
  );
}

/** A captioned set of items inside a menu. */
export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col">
      <p aria-hidden className="px-2 pt-1 pb-0.5 text-small font-medium text-fg-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

export interface MenuItemProps {
  /** One choice out of several (radio) or an on/off choice (checkbox). */
  kind: 'radio' | 'checkbox';
  checked: boolean;
  onSelect: () => void;
  /** Close the menu after choosing (single-choice menus do). */
  closeOnSelect?: boolean;
  children: ReactNode;
}

export function MenuItem({
  kind,
  checked,
  onSelect,
  closeOnSelect = false,
  children,
}: MenuItemProps) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role={kind === 'radio' ? 'menuitemradio' : 'menuitemcheckbox'}
      aria-checked={checked}
      tabIndex={-1}
      onClick={() => {
        onSelect();
        if (closeOnSelect) close();
      }}
      className="flex h-7 items-center gap-2 rounded-[8px] px-2 text-left text-body text-fg focus-ring hover:bg-input focus-visible:bg-input"
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-fg">
        {checked ? <IconCheck size={14} aria-hidden /> : null}
      </span>
      {children}
    </button>
  );
}
