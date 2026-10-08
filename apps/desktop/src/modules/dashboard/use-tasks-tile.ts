import type { Task } from '@personal-os/shared';
import { percentOf } from '@personal-os/shared';
import { istDayStartPlus, startOfIstDay, toIstInput } from '../tasks/dates';
import { sectionOf } from '../tasks/sections';
import { useOpenTasks, useTasks } from '../tasks/tasks-queries';

/** What the "Today's tasks" tile shows (value, unit, two lines, progress 0 to 100). */
export interface TasksTileText {
  value: string | number;
  unit: string;
  lines: readonly [string, string];
  progress: number;
}

/** Keeps a line's height while it has no text, so the tile does not jump. */
const BLANK = ' ';

const byDueThenPosition = (a: Task, b: Task) =>
  Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? '') || a.position - b.position;

/** "5:00 PM" for a time, in India time. */
function clock(iso: string): string {
  const [hours = '0', minutes = '00'] = toIstInput(iso).slice(11).split(':');
  const hour = Number(hours);
  return `${String(hour % 12 || 12)}:${minutes} ${hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * Pure text for the tile. `openTasks` are all open top-level tasks; `dueToday` are the top-level
 * tasks due today by the India calendar day, in any status.
 */
export function tasksTileText(
  openTasks: readonly Task[],
  dueToday: readonly Task[],
  now: Date,
): TasksTileText {
  const overdue = openTasks.filter((task) => sectionOf(task, now) === 'overdue');
  const todayOpen = dueToday.filter((task) => task.status !== 'done');
  const total = dueToday.length;
  const done = total - todayOpen.length;
  const next = [...overdue.sort(byDueThenPosition), ...todayOpen.sort(byDueThenPosition)][0];

  let lines: readonly [string, string];
  if (next) {
    const due = sectionOf(next, now) === 'overdue' ? 'Overdue' : null;
    lines = [
      `Next: ${next.title}`,
      due ?? (next.dueAllDay || !next.dueAt ? 'All day' : `Due ${clock(next.dueAt)}`),
    ];
  } else if (total > 0) {
    lines = ['All done for today', BLANK];
  } else {
    lines = ['Nothing due today', BLANK];
  }
  return { value: done, unit: `of ${String(total)} done`, lines, progress: percentOf(done, total) };
}

/** The tile text from the real tasks; while loading or on error it is quiet placeholder text. */
export function useTasksTile(now: Date): {
  status: 'loading' | 'error' | 'ready';
  text: TasksTileText;
} {
  const day = now.getTime();
  const open = useOpenTasks();
  const today = useTasks({ dueFrom: startOfIstDay(day), dueTo: istDayStartPlus(day, 1) });

  if (open.isError || today.isError) {
    return { status: 'error', text: placeholder('Could not load tasks') };
  }
  if (!open.data || !today.data) return { status: 'loading', text: placeholder(BLANK) };
  return { status: 'ready', text: tasksTileText(open.data, today.data, now) };
}

function placeholder(firstLine: string): TasksTileText {
  return { value: '–', unit: 'of – done', lines: [firstLine, BLANK], progress: 0 };
}
