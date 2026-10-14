import { APP_TIMEZONE, TAG_PALETTE, type Project } from '@personal-os/shared';
import { istDay } from '../tasks/dates';

export const PROJECT_COLORS = TAG_PALETTE;

/** The accent of a project: its own color, or the Projects module color. */
export const accentOf = (color: string | null): string => color ?? 'var(--module-projects)';

const day = new Intl.DateTimeFormat('en-IN', {
  timeZone: APP_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dayShort = new Intl.DateTimeFormat('en-IN', {
  timeZone: APP_TIMEZONE,
  day: 'numeric',
  month: 'short',
});
const clock = new Intl.DateTimeFormat('en-IN', {
  timeZone: APP_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "12 Oct 2025" in India time. */
export const formatDay = (iso: string): string => day.format(Date.parse(iso));
/** "12 Oct" in India time. */
export const formatDayShort = (iso: string | number): string =>
  dayShort.format(typeof iso === 'number' ? iso : Date.parse(iso));
/** "5:30 pm" in India time. */
export const formatClock = (iso: string): string => clock.format(Date.parse(iso)).toLowerCase();

/** "01:05:09" for a running timer. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** The due day is before today (India days) and the project is still going. */
export function isOverdue(project: Pick<Project, 'dueAt' | 'status'>, now: number): boolean {
  return (
    project.dueAt !== null &&
    (project.status === 'active' || project.status === 'on_hold') &&
    istDay(Date.parse(project.dueAt)) < istDay(now)
  );
}

/** "3 of 8 tasks" or "No tasks yet". */
export function progressText(progress: { done: number; total: number }): string {
  return progress.total === 0
    ? 'No tasks yet'
    : `${String(progress.done)} of ${String(progress.total)} tasks`;
}
