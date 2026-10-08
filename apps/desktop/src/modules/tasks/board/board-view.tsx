import {
  closestCorners,
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { TASK_STATUSES, type Task, type TaskStatus } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useToasts } from '../../../store/toast-store';
import { taskAnnouncements, useTaskSensors } from '../drag/dnd';
import { columnDropId, parseDropId } from '../drag/drop-ids';
import { useDrag } from '../my-tasks/use-drag';
import { TaskCard, type TaskItemContext } from '../my-tasks/task-item';
import { useTaskActions } from '../tasks-queries';
import { useTasksUi } from '../tasks-ui-store';
import { boardPlace, planBoardDrop } from './plan-drop';

export interface BoardViewProps {
  tasks: readonly Task[];
  now: Date;
  /** Sort is Manual: only then can cards be reordered inside a column. */
  manualSort: boolean;
  /** false (the Archived filter): cards cannot be dragged. */
  draggable?: boolean;
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
  const itemKey = `${status}/${task.id}`;
  const drag = useDrag({ task, itemKey, context }, task.id);
  return <TaskCard task={task} itemKey={itemKey} context={context} drag={drag} />;
}

function InsertionLine() {
  return <li aria-hidden className="-my-0.5 h-0.5 rounded-full bg-accent" />;
}

function Column({
  status,
  tasks,
  context,
  insertAt,
  draggable,
}: {
  status: TaskStatus;
  tasks: readonly Task[];
  context: TaskItemContext;
  /** Index in this column where the dragged card would land (a quiet line), or null. */
  insertAt: number | null;
  draggable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(status) });
  const name = COLUMN_NAMES[status];
  return (
    <section
      aria-label={name}
      className={cx(
        'flex min-h-48 min-w-[200px] flex-1 flex-col gap-3 rounded-card glass p-3 transition-shadow duration-150 motion-reduce:transition-none',
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
              {draggable ? (
                <SortableCard task={task} status={status} context={context} />
              ) : (
                <TaskCard task={task} itemKey={`${status}/${task.id}`} context={context} />
              )}
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
export function BoardView({ tasks, now, manualSort, draggable = true }: BoardViewProps) {
  const sensors = useTaskSensors();
  const { selectedTaskId, select } = useTasksUi();
  const { complete, update, remove, move } = useTaskActions();
  const [tabKey, setTabKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // After a keyboard drop the card may be in another column (a new element): focus it again
  // on the next renders, for a moment, until the moved card is on the screen
  const refocus = useRef<{ id: string; at: number } | null>(null);
  const byKeyboard = useRef(false);
  useEffect(() => {
    const pending = refocus.current;
    if (!pending) return;
    if (Date.now() - pending.at > 1500) {
      refocus.current = null;
      return;
    }
    document.querySelector<HTMLElement>(`[data-task-id="${pending.id}"]`)?.focus();
  });

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
  const onDragStart = ({ active: lifted, activatorEvent }: DragStartEvent) => {
    byKeyboard.current = activatorEvent instanceof KeyboardEvent;
    setActiveId(String(lifted.id));
  };
  const onDragOver = ({ over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
  };
  const onDragEnd = ({ active: dropped, over }: DragEndEvent) => {
    finish();
    if (byKeyboard.current) refocus.current = { id: String(dropped.id), at: Date.now() };
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{ announcements: taskAnnouncements(titleOf, nameOf), restoreFocus: false }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
      >
        <div className="flex items-stretch gap-3 overflow-x-auto">
          {columns.map((column) => (
            <Column
              key={column.status}
              status={column.status}
              tasks={column.tasks}
              context={context}
              insertAt={lineAt?.status === column.status ? lineIndex : null}
              draggable={draggable}
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
