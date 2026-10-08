import type { Task, TaskStatus } from '@personal-os/shared';
import { parseDropId } from '../drag/drop-ids';
import { resolveDrop, type DropResult } from '../drag/resolve-drop';

export interface BoardDrag {
  /** The tasks as shown, in order (columns keep this order). */
  tasks: readonly Task[];
  activeId: string;
  /** What the dragged card is over: a task id or a column drop id. */
  overId: string | null;
}

/** Where the card would land: a column and an index in that column without the dragged card. */
export interface BoardPlace {
  status: TaskStatus;
  index: number;
}

/**
 * The landing place for a drag. Over a column it goes to the end; over a card it goes before that
 * card, except when moving down inside the same column, where it goes after it.
 */
export function boardPlace({ tasks, activeId, overId }: BoardDrag): BoardPlace | null {
  const active = tasks.find((task) => task.id === activeId);
  if (!active || overId === null) return null;

  const target = parseDropId(overId);
  if (target?.kind === 'column') {
    const others = tasks.filter((task) => task.status === target.status && task.id !== activeId);
    return { status: target.status, index: others.length };
  }

  const over = tasks.find((task) => task.id === overId);
  if (!over) return null;
  // Over itself: it stays where it is
  if (over.id === activeId) {
    const own = tasks.filter((task) => task.status === active.status);
    return { status: active.status, index: own.findIndex((task) => task.id === activeId) };
  }
  const column = tasks.filter((task) => task.status === over.status);
  const without = column.filter((task) => task.id !== activeId);
  const overIndex = without.findIndex((task) => task.id === overId);
  const movingDown =
    active.status === over.status &&
    column.findIndex((task) => task.id === activeId) <
      column.findIndex((task) => task.id === overId);
  return { status: over.status, index: overIndex + (movingDown ? 1 : 0) };
}

/** Turns a finished drag into what to do (move, refuse, or nothing) using resolveDrop. */
export function planBoardDrop(drag: BoardDrag, now: Date, manualSort: boolean): DropResult {
  const task = drag.tasks.find((candidate) => candidate.id === drag.activeId);
  const place = boardPlace(drag);
  if (!task || !place) return { kind: 'none' };

  const sameContainer = task.status === place.status;
  const column = drag.tasks.filter((candidate) => candidate.status === place.status);
  // Put back where it was: nothing to do
  if (sameContainer && column.findIndex((candidate) => candidate.id === task.id) === place.index) {
    return { kind: 'none' };
  }
  const without = column.filter((candidate) => candidate.id !== task.id);
  return resolveDrop({
    task,
    target: { kind: 'column', status: place.status },
    prev: without[place.index - 1],
    next: without[place.index],
    now,
    manualSort,
    sameContainer,
  });
}
