import type { MoveTaskInput, Task, TaskStatus } from '@personal-os/shared';
import { startOfIstDay } from '../dates';
import { sectionOf, type SectionId } from '../sections';
import { positionBetween } from './position';

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a task was dropped: a date section (Cards and List), a Board column, or a list. */
export type DropTarget =
  | { kind: 'section'; section: SectionId }
  | { kind: 'column'; status: TaskStatus }
  /** A list with no date meaning (Group is not Due): only reordering inside it is possible. */
  | { kind: 'list' };

export interface DropContext {
  task: Task;
  target: DropTarget;
  /** The task that will sit just above the dropped one in the target (if any). */
  prev?: Task;
  /** The task that will sit just below it (if any). */
  next?: Task;
  now: Date;
  /** Sort is Manual. Reordering is only allowed then. */
  manualSort: boolean;
  /** The drop is inside the container the card was lifted from. */
  sameContainer: boolean;
}

export type DropResult =
  /** Send this to the server. `position` is only for showing the move at once. */
  | { kind: 'move'; input: MoveTaskInput; position?: number }
  /** Upcoming: ask for a date, then send `input` with the chosen date added (dueAt, dueAllDay). */
  | { kind: 'pick-date'; input: MoveTaskInput; position?: number }
  /** Nothing changes (dropped where it was). */
  | { kind: 'none' }
  /** The drop is not allowed; show this message. */
  | { kind: 'reject'; message: string };

export const NOT_MANUAL_MESSAGE = 'Sort is not Manual, so reordering is off.';

/** The same time of day on today's India date, or the start of today when the task has no time. */
function dueToday(task: Task, now: Date): Pick<MoveTaskInput, 'dueAt' | 'dueAllDay'> {
  const todayStart = startOfIstDay(now.getTime());
  if (task.dueAt && !task.dueAllDay) {
    const timeOfDay = (((Date.parse(task.dueAt) + IST_MS) % DAY_MS) + DAY_MS) % DAY_MS;
    return { dueAt: new Date(Date.parse(todayStart) + timeOfDay).toISOString(), dueAllDay: false };
  }
  return { dueAt: todayStart, dueAllDay: true };
}

/**
 * Turns a drop into the change to make (docs/features/tasks-redesign.md, Feature 2):
 * Today sets the due date to today (keeps an existing time, otherwise all-day), Upcoming asks for a
 * date, Overdue accepts nothing, No date only reorders, Completed completes, and dragging a done
 * task out of Completed reopens it. Reordering needs Manual sort.
 */
export function resolveDrop({
  task,
  target,
  prev,
  next,
  now,
  manualSort,
  sameContainer,
}: DropContext): DropResult {
  const neighbours: Pick<MoveTaskInput, 'afterId' | 'beforeId'> = {
    ...(prev ? { afterId: prev.id } : {}),
    ...(next ? { beforeId: next.id } : {}),
  };
  const position = positionBetween(prev?.position, next?.position);
  const reorder = (): DropResult => {
    if (!manualSort) return { kind: 'reject', message: NOT_MANUAL_MESSAGE };
    return { kind: 'move', input: { id: task.id, ...neighbours }, position };
  };
  const reopen: Partial<MoveTaskInput> = task.status === 'done' ? { status: 'todo' } : {};

  if (target.kind === 'list') {
    return sameContainer ? reorder() : { kind: 'reject', message: 'Drop it in the same list.' };
  }

  if (target.kind === 'column') {
    if (target.status === task.status) return sameContainer ? reorder() : { kind: 'none' };
    // A change of column works with any sort; the place is only kept when the sort is manual
    const input: MoveTaskInput = {
      id: task.id,
      status: target.status,
      ...(manualSort ? neighbours : {}),
    };
    return { kind: 'move', input, ...(manualSort ? { position } : {}) };
  }

  const here = sectionOf(task, now);
  switch (target.section) {
    case 'overdue':
      return { kind: 'reject', message: 'Overdue is only for tasks that are past their date.' };
    case 'completed':
      if (here === 'completed') return { kind: 'none' };
      return { kind: 'move', input: { id: task.id, status: 'done' } };
    case 'nodate':
      if (here === 'nodate' && sameContainer) return reorder();
      return { kind: 'reject', message: 'Clear the date in the task details to move it here.' };
    case 'today':
      if (here === 'today') return sameContainer ? reorder() : { kind: 'none' };
      return {
        kind: 'move',
        input: { id: task.id, ...reopen, ...dueToday(task, now), ...neighbours },
        position,
      };
    case 'upcoming':
      if (here === 'upcoming') return sameContainer ? reorder() : { kind: 'none' };
      return { kind: 'pick-date', input: { id: task.id, ...reopen, ...neighbours }, position };
  }
}
