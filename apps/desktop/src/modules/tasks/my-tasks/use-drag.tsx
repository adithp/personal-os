import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragHandle } from '../shared/drag-handle';
import type { TaskItemProps } from './task-item';

/** Marks the drag handle, so the task shortcuts leave its keys to dnd-kit. */
export const DRAG_HANDLE_ATTRIBUTE = 'data-drag-handle';

/** The drag props of a card or row. `sortableId` is the item key unless the caller uses another id. */
export function useDrag({ task, itemKey, context }: TaskItemProps, sortableId: string = itemKey) {
  const sortable = useSortable({ id: sortableId });
  return {
    setNodeRef: sortable.setNodeRef,
    style: {
      transform: CSS.Translate.toString(sortable.transform),
      transition: sortable.transition,
    },
    dragging: sortable.isDragging,
    handle: (
      <DragHandle
        title={task.title}
        {...sortable.attributes}
        {...sortable.listeners}
        {...{ [DRAG_HANDLE_ATTRIBUTE]: '' }}
        // Roving tabindex: only the handle of the item that is the Tab stop can be reached with Tab
        tabIndex={context.tabbableKey === itemKey ? 0 : -1}
        // Space on the button also clicks it; that must not open the task behind it
        onClick={(event) => {
          event.stopPropagation();
        }}
      />
    ),
  };
}
