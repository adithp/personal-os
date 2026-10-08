import { cx } from '@personal-os/ui';
import { IconGripVertical } from '@tabler/icons-react';
import type { ComponentPropsWithoutRef } from 'react';

export interface DragHandleProps extends ComponentPropsWithoutRef<'button'> {
  /** The task title, for the accessible name. */
  title: string;
}

/**
 * The grip that lifts a card or row. Quiet until the card is hovered or focused. Spread the
 * `attributes` and `listeners` of dnd-kit's useSortable onto it.
 */
export function DragHandle({ title, className, ...props }: DragHandleProps) {
  return (
    <button
      type="button"
      aria-label={`Drag ${title}`}
      className={cx(
        'inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-[6px] text-fg-muted opacity-0 focus-ring group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100',
        className,
      )}
      {...props}
    >
      <IconGripVertical size={14} aria-hidden />
    </button>
  );
}
