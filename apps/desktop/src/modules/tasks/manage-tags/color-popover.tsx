import { TAG_PALETTE, TEXT_ON_TILE } from '@personal-os/shared';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { colorName, gridTarget, isGridKey } from './swatches';

const COLUMNS = 5;

export interface ColorPopoverProps {
  /** The dot button the popover hangs under. */
  anchor: HTMLElement;
  name: string;
  current: string;
  onPick: (color: string) => void;
  /** Closes the popover; focus goes back to the dot. */
  onClose: () => void;
}

/**
 * The ten palette swatches under a tag's dot. It is drawn in the page body (the list scrolls and
 * would cut it off) and closes on Escape, Tab, a pick, or a click outside.
 */
export function ColorPopover({ anchor, name, current, onPick, onClose }: ColorPopoverProps) {
  const box = useRef<HTMLDivElement>(null);
  const rect = anchor.getBoundingClientRect();

  // The latest onClose, so a re-render does not restart the effects below
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Focus goes to the checked swatch once, when the popover opens
  useEffect(() => {
    const checked = box.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? box.current?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
  }, []);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !box.current?.contains(event.target) &&
        !anchor.contains(event.target)
      ) {
        closeRef.current();
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [anchor]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose();
      return;
    }
    if (!isGridKey(event.key)) return;
    const swatches = [
      ...(box.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []),
    ];
    const index = swatches.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const next = gridTarget(event.key, index, COLUMNS, swatches.length);
    if (next !== null) swatches[next]?.focus();
  };

  return createPortal(
    <div
      ref={box}
      role="menu"
      aria-label={`Color of ${name}`}
      onKeyDown={onKeyDown}
      style={{ top: rect.bottom + 4, left: rect.left }}
      className="fixed z-50 grid grid-cols-5 gap-1 rounded-card glass-strong p-1.5"
    >
      {TAG_PALETTE.map((color) => {
        const on = color.toLowerCase() === current.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            aria-label={colorName(color)}
            tabIndex={-1}
            onClick={() => {
              onPick(color);
            }}
            className="flex size-7 items-center justify-center rounded-chip focus-ring hover:bg-input focus-visible:bg-input"
          >
            <span
              className="flex size-6 items-center justify-center rounded-full"
              style={{ backgroundColor: color, color: TEXT_ON_TILE }}
            >
              {on ? <IconCheck size={12} aria-hidden /> : null}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
