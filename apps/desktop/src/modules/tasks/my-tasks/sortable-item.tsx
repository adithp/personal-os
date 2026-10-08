import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragHandle } from '../shared/drag-handle';
import { TaskCard, TaskRow, type TaskItemProps } from './task-item';

/** Marks the drag handle, so the task shortcuts leave its keys to dnd-kit. */
export const DRAG_HANDLE_ATTRIBUTE = 'data-drag-handle';

function useDrag({ task, itemKey, context }: TaskItemProps) {
  const sortable = useSortable({ id: itemKey });
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

/** A card that can be dragged (must be inside a DndContext and a SortableContext). */
export function SortableCard(props: TaskItemProps) {
  const drag = useDrag(props);
  return <TaskCard {...props} drag={drag} />;
}

/** A list row that can be dragged. */
export function SortableRow(props: TaskItemProps) {
  const drag = useDrag(props);
  return <TaskRow {...props} drag={drag} />;
}
