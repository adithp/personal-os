import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, KeyboardEventHandler, PointerEventHandler } from 'react';

export interface RowDrag {
  setNodeRef: (element: HTMLElement | null) => void;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
  dragging: boolean;
  onPointerDown?: PointerEventHandler;
  onSpaceKeyDown?: KeyboardEventHandler;
}

/**
 * Drag props of one favorite row. Only the pointer and the Space key start a drag (on the link, the
 * row's activator); Enter must still open the favorite.
 */
export function useRowDrag(id: string): RowDrag {
  const sortable = useSortable({ id });
  const listeners = (sortable.listeners ?? {}) as {
    onPointerDown?: PointerEventHandler;
    onKeyDown?: KeyboardEventHandler;
  };
  return {
    setNodeRef: sortable.setNodeRef,
    setActivatorNodeRef: sortable.setActivatorNodeRef,
    style: {
      transform: CSS.Translate.toString(sortable.transform),
      transition: sortable.transition,
    },
    dragging: sortable.isDragging,
    onPointerDown: listeners.onPointerDown,
    onSpaceKeyDown: listeners.onKeyDown,
  };
}
