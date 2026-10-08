import {
  closestCorners,
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { TASK_STATUSES, type Task, type TaskStatus } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { Fragment, useState } from 'react';
import { useToasts } from '../../../store/toast-store';
import { taskAnnouncements, useTaskSensors } from '../drag/dnd';
import { columnDropId, parseDropId } from '../drag/drop-ids';
import { TaskCard, type TaskItemContext } from '../my-tasks/task-item';
import { DragHandle } from '../shared/drag-handle';
import { useTaskActions } from '../tasks-queries';
import { useTasksUi } from '../tasks-ui-store';
import { boardPlace, planBoardDrop } from './plan-drop';

export interface BoardViewProps {
  tasks: readonly Task[];
  now: Date;
  /** Sort is Manual: only then can cards be reordered inside a column. */
  manualSort: boolean;
}

const COLUMN_NAMES: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
};

function SortableCard({
  task,
  status,
  context,
}: {
  task: Task;
  status: TaskStatus;
  context: TaskItemContext;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: task.id });
  return (
    <TaskCard
      task={task}
      itemKey={`${status}/${task.id}`}
      context={context}
      drag={{
        setNodeRef,
        dragging: isDragging,
        handle: <DragHandle title={task.title} {...attributes} {...listeners} />,
      }}
    />
  );
}

function InsertionLine() {
  return <li aria-hidden className="-my-0.5 h-0.5 rounded-full bg-accent" />;
}

function Column({
  status,
  tasks,
  context,
  insertAt,
}: {
  status: TaskStatus;
  tasks: readonly Task[];
  context: TaskItemContext;
  /** Index in this column where the dragged card would land (a quiet line), or null. */
  insertAt: number | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(status) });
  const name = COLUMN_NAMES[status];
  return (
    <section
      aria-label={name}
      className={cx(
        'flex min-h-48 min-w-0 flex-1 flex-col gap-3 rounded-card glass p-3 transition-shadow duration-150',
        isOver && 'ring-1 ring-accent',
      )}
    >
      <h2 className="flex items-center gap-1.5 px-1 text-small font-medium text-fg-muted">
        {name}
        <span className="font-normal">{tasks.length}</span>
      </h2>
      <SortableContext items={tasks.map((task) => task.id)} strategy={() => null}>
        <ul ref={setNodeRef} aria-label={`${name} tasks`} className="flex flex-1 flex-col gap-2">
          {tasks.map((task, index) => (
            <Fragment key={task.id}>
              {insertAt === index ? <InsertionLine /> : null}
              <SortableCard task={task} status={status} context={context} />
            </Fragment>
          ))}
          {insertAt !== null && insertAt >= tasks.length ? <InsertionLine /> : null}
          {tasks.length === 0 && insertAt === null ? (
            <li className="px-1 text-small text-fg-muted">Nothing here</li>
          ) : null}
        </ul>
      </SortableContext>
    </section>
  );
}

/** Board: three columns (To do, In progress, Done) with the same card as Cards view, draggable. */
export function BoardView({ tasks, now, manualSort }: BoardViewProps) {
  const sensors = useTaskSensors();
  const { selectedTaskId, select } = useTasksUi();
  const { complete, update, remove, move } = useTaskActions();
  const [tabKey, setTabKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const columns = TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));
  const keys = columns.flatMap((column) => column.tasks.map((t) => `${column.status}/${t.id}`));
  const tabbableKey = tabKey !== null && keys.includes(tabKey) ? tabKey : (keys[0] ?? null);

  const context: TaskItemContext = {
    now,
    selectedId: selectedTaskId,
    tabbableKey,
    onFocusItem: setTabKey,
    onSelect: (task) => {
      select(task.id);
    },
    onToggle: (task) => {
      if (task.status === 'done') update.mutate({ id: task.id, status: 'todo' });
      else complete.mutate(task.id);
    },
    onDelete: (task) => {
      if (selectedTaskId === task.id) select(null);
      remove.mutate(task.id);
    },
  };

  const titleOf = (id: string) => tasks.find((task) => task.id === id)?.title ?? 'Task';
  const nameOf = (id: string) => {
    const target = parseDropId(id);
    return target?.kind === 'column' ? `${COLUMN_NAMES[target.status]} column` : titleOf(id);
  };

  const place = activeId !== null ? boardPlace({ tasks, activeId, overId }) : null;
  const active = tasks.find((task) => task.id === activeId);
  // Hide the line when the card would stay where it is
  const stays =
    place !== null &&
    active?.status === place.status &&
    columns.find((c) => c.status === place.status)?.tasks.findIndex((t) => t.id === activeId) ===
      place.index;
  const lineAt = place && !stays ? place : null;
  // The index counts the column without the dragged card; the column still shows it
  const lineColumn = lineAt ? columns.find((c) => c.status === lineAt.status) : undefined;
  const liftedIndex = lineColumn?.tasks.findIndex((t) => t.id === activeId) ?? -1;
  const lineIndex =
    lineAt === null
      ? null
      : lineAt.index + (liftedIndex >= 0 && lineAt.index >= liftedIndex ? 1 : 0);

  const finish = () => {
    setActiveId(null);
    setOverId(null);
  };
  const onDragStart = ({ active: lifted }: DragStartEvent) => {
    setActiveId(String(lifted.id));
  };
  const onDragOver = ({ over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
  };
  const onDragEnd = ({ active: dropped, over }: DragEndEvent) => {
    finish();
    const result = planBoardDrop(
      { tasks, activeId: String(dropped.id), overId: over ? String(over.id) : null },
      now,
      manualSort,
    );
    if (result.kind === 'move') {
      move.mutate({
        input: result.input,
        ...(result.position !== undefined ? { position: result.position } : {}),
      });
    } else if (result.kind === 'reject') {
      useToasts.getState().show(result.message, { tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {manualSort ? null : (
        <p className="px-1 text-small text-fg-muted">Sort is not Manual, so reordering is off.</p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{ announcements: taskAnnouncements(titleOf, nameOf) }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
      >
        <div className="flex items-stretch gap-3">
          {columns.map((column) => (
            <Column
              key={column.status}
              status={column.status}
              tasks={column.tasks}
              context={context}
              insertAt={lineAt?.status === column.status ? lineIndex : null}
            />
          ))}
        </div>
        <DragOverlay>
          {active ? (
            <ul>
              <TaskCard task={active} itemKey={`overlay/${active.id}`} context={context} />
            </ul>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
