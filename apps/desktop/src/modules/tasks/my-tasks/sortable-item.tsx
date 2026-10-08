import { TaskCard, TaskRow, type TaskItemProps } from './task-item';
import { useDrag } from './use-drag';

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
