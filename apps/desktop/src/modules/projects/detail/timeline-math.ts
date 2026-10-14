import type { Milestone, Project, Task } from '@personal-os/shared';
import { istDay } from '../../tasks/dates';

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = (5 * 60 + 30) * 60 * 1000;

export interface TimelineItem {
  kind: 'milestone' | 'task';
  id: string;
  title: string;
  /** UTC ms of the date. */
  at: number;
  done: boolean;
}

export interface Timeline {
  /** UTC ms of the first and last India day start on the axis. */
  start: number;
  end: number;
  items: TimelineItem[];
  /** Day starts (UTC ms) to label on the axis, at most 6. */
  ticks: number[];
}

/** UTC ms of the start of the India day that contains `ms`. */
const dayStart = (ms: number): number => istDay(ms) * DAY_MS - IST_MS;

/**
 * The date axis of a project: from its start date (or the first thing on it) to its due date (or
 * the last thing on it), always including today, in whole India days. The items are the milestones
 * with a due date and the top-level tasks with a due date, oldest first.
 */
export function buildTimeline(
  project: Pick<Project, 'startAt' | 'dueAt' | 'createdAt'>,
  milestones: readonly Milestone[],
  tasks: readonly Task[],
  now: number,
): Timeline {
  const items: TimelineItem[] = [
    ...milestones.flatMap((milestone) =>
      milestone.dueAt
        ? [
            {
              kind: 'milestone' as const,
              id: milestone.id,
              title: milestone.title,
              at: Date.parse(milestone.dueAt),
              done: milestone.doneAt !== null,
            },
          ]
        : [],
    ),
    ...tasks.flatMap((task) =>
      task.dueAt && task.parentTaskId === null && (task.archivedAt === null || task.status === 'done')
        ? [
            {
              kind: 'task' as const,
              id: task.id,
              title: task.title,
              at: Date.parse(task.dueAt),
              done: task.status === 'done',
            },
          ]
        : [],
    ),
  ].sort((a, b) => a.at - b.at);

  const points = [
    now,
    ...items.map((item) => item.at),
    ...(project.startAt ? [Date.parse(project.startAt)] : []),
    ...(project.dueAt ? [Date.parse(project.dueAt)] : []),
  ];
  // With nothing dated, the axis starts when the project was made
  if (!project.startAt && items.length === 0) points.push(Date.parse(project.createdAt));
  const start = dayStart(Math.min(...points));
  const end = Math.max(dayStart(Math.max(...points)) + DAY_MS, start + 7 * DAY_MS);

  const days = Math.round((end - start) / DAY_MS);
  const count = Math.min(6, days + 1);
  const ticks = Array.from({ length: count }, (_, i) =>
    dayStart(start + Math.round((i * (end - start)) / Math.max(1, count - 1))),
  );
  return { start, end, items, ticks };
}

/** Where a time sits on the axis, as a percent from the left (kept between 0 and 100). */
export function positionPercent(timeline: Pick<Timeline, 'start' | 'end'>, at: number): number {
  const span = timeline.end - timeline.start;
  return Math.min(100, Math.max(0, ((at - timeline.start) / span) * 100));
}
