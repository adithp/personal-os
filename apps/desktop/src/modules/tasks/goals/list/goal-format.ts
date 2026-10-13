import type { Goal } from '@personal-os/shared';
import { istDay, toIstDate } from '../../dates';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
];

/** "31 Dec" (India day); the year is added when it is not this year: "31 Dec 2026". */
function dayLabel(iso: string, now: Date): string {
  const [year = 0, month = 1, day = 1] = toIstDate(iso).split('-').map(Number);
  const thisYear = Number(toIstDate(now.toISOString()).slice(0, 4));
  return `${String(day)} ${MONTHS[month - 1] ?? ''}${year === thisYear ? '' : ` ${String(year)}`}`;
}

/** The roving-focus key of a goal card. */
export const goalKey = (goal: Pick<Goal, 'id'>) => `goal/${goal.id}`;

export interface TargetLine {
  text: string;
  /** The target day is before today in India and the goal is still active. */
  passed: boolean;
}

/** The footer line of an active goal: "By 31 Dec", "Target passed · 2 Sept", or "No target date". */
export function targetLine(goal: Pick<Goal, 'targetAt' | 'status'>, now: Date): TargetLine {
  if (!goal.targetAt) return { text: 'No target date', passed: false };
  const passed =
    goal.status === 'active' && istDay(Date.parse(goal.targetAt)) < istDay(now.getTime());
  const day = dayLabel(goal.targetAt, now);
  return { text: passed ? `Target passed · ${day}` : `By ${day}`, passed };
}

/** "Achieved 13 Oct" or "Dropped 13 Oct" from the time it was closed (India day). */
export function closedLine(goal: Pick<Goal, 'status' | 'closedAt'>, now: Date): string {
  const word = goal.status === 'dropped' ? 'Dropped' : 'Achieved';
  return goal.closedAt ? `${word} ${dayLabel(goal.closedAt, now)}` : word;
}

/** "3 of 8 tasks" (or "1 of 1 task"). */
export function progressText(progress: { done: number; total: number }): string {
  return `${String(progress.done)} of ${String(progress.total)} ${progress.total === 1 ? 'task' : 'tasks'}`;
}
