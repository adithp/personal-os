import type { Task } from '@personal-os/shared';
import { istDay } from './dates';

/**
 * The date sections of My tasks (docs/features/tasks.md). Everything is by India calendar day:
 * a task due today at 9 AM is still in Today at 3 PM. A done task is always in Completed.
 */
export const SECTION_IDS = ['overdue', 'today', 'upcoming', 'nodate', 'completed'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABELS: Record<SectionId, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  nodate: 'No date',
  completed: 'Completed',
};

export function sectionOf(task: Task, now: Date): SectionId {
  if (task.status === 'done') return 'completed';
  if (!task.dueAt) return 'nodate';
  const offset = istDay(Date.parse(task.dueAt)) - istDay(now.getTime());
  if (offset < 0) return 'overdue';
  if (offset === 0) return 'today';
  return 'upcoming';
}

/** Splits tasks into the sections, keeping the order they came in. Every section is present. */
export function groupIntoSections(tasks: readonly Task[], now: Date): Record<SectionId, Task[]> {
  const sections: Record<SectionId, Task[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    nodate: [],
    completed: [],
  };
  for (const task of tasks) sections[sectionOf(task, now)].push(task);
  return sections;
}

const isOpenTopLevel = (task: Task) =>
  task.status !== 'done' && task.archivedAt === null && task.parentTaskId === null;

/** The numbers in the Overview summary: "7 open · 2 overdue". Subtasks and archived are not counted. */
export function summarize(tasks: readonly Task[], now: Date): { open: number; overdue: number } {
  const open = tasks.filter(isOpenTopLevel);
  return { open: open.length, overdue: open.filter((t) => sectionOf(t, now) === 'overdue').length };
}

/**
 * "Tasks due soon": up to `limit` open tasks that have a due date, overdue first, then today, then
 * upcoming, each by due date. Never done, archived, or subtasks.
 */
export function dueSoon(tasks: readonly Task[], now: Date, limit = 5): Task[] {
  const rank: Record<SectionId, number> = {
    overdue: 0,
    today: 1,
    upcoming: 2,
    nodate: 3,
    completed: 4,
  };
  return tasks
    .filter((task) => isOpenTopLevel(task) && task.dueAt !== null)
    .sort(
      (a, b) =>
        rank[sectionOf(a, now)] - rank[sectionOf(b, now)] ||
        Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? '') ||
        a.position - b.position,
    )
    .slice(0, limit);
}

/** Tasks in the Inbox: no due date and no tags, not done, not archived, not a subtask. */
export function inboxTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter(
    (task) => isOpenTopLevel(task) && task.dueAt === null && task.tags.length === 0,
  );
}
