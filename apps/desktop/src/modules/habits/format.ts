import {
  HABIT_WEEKDAY_NAMES,
  dateOfDay,
  dayNumberOf,
  isoWeekdayOfDay,
  rangeBounds,
  type Habit,
  type HabitDay,
  type HabitRange,
  type HabitSchedule,
} from '@personal-os/shared';

export const RANGE_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const satisfies readonly { value: HabitRange; label: string }[];

/** The accent of a habit: its own color when it has one, else the Habits module color. */
export const habitColor = (habit: Pick<Habit, 'color'>): string =>
  habit.color ?? 'var(--module-habits)';

/** "Every day", "Mon, Wed, Fri", "Every 3 days". */
export function scheduleLabel(schedule: HabitSchedule): string {
  switch (schedule.type) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return schedule.days.map((day) => HABIT_WEEKDAY_NAMES[day - 1] ?? '').join(', ');
    case 'custom':
      return `Every ${String(schedule.everyDays)} days`;
  }
}

/** "3 / 8" for a counter habit, "" for a simple check. */
export const progressLabel = (habit: Habit): string =>
  habit.target > 1 ? `${String(habit.today.count)} / ${String(habit.target)}` : '';

/** Habits scheduled today: not done first, then done; the server order is kept inside each part. */
export function splitToday(habits: readonly Habit[]): { today: Habit[]; notToday: Habit[] } {
  const scheduled = habits.filter((habit) => habit.today.scheduled);
  return {
    today: [
      ...scheduled.filter((habit) => !habit.today.done),
      ...scheduled.filter((habit) => habit.today.done),
    ],
    notToday: habits.filter((habit) => !habit.today.scheduled),
  };
}

/** Distinct categories, sorted. */
export function categoriesOf(habits: readonly Habit[]): string[] {
  const names = new Set<string>();
  for (const habit of habits) if (habit.category) names.add(habit.category);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** "1 day" / "5 days". */
export const daysText = (count: number): string => `${String(count)} ${count === 1 ? 'day' : 'days'}`;

/** 0.8333 -> "83%". */
export const percentText = (rate: number): string => `${String(Math.round(rate * 100))}%`;

const DAY_FORMAT = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const MONTH_FORMAT = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const SHORT_MONTH_FORMAT = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "Mon, 12 Oct" for an India day (the day is a plain calendar date, so no zone shift). */
export const dayText = (date: string): string => DAY_FORMAT.format(utc(date));

/** "October 2026". */
export const monthText = (date: string): string => MONTH_FORMAT.format(utc(date));

/** First day of the month before / after the month of `date`. */
export const previousMonth = (date: string): string =>
  rangeBounds('month', dateOfDay(dayNumberOf(rangeBounds('month', date).from) - 1)).from;
export const nextMonth = (date: string): string =>
  dateOfDay(dayNumberOf(rangeBounds('month', date).to) + 1);

export type CellState = 'done' | 'missed' | 'open' | 'off' | 'future';

/** How a calendar day is drawn. `today` is still open: it is not missed yet. */
export function cellState(day: HabitDay, today: string): CellState {
  if (day.future) return 'future';
  if (day.done) return 'done';
  if (!day.scheduled) return 'off';
  return day.date === today ? 'open' : 'missed';
}

const STATE_WORD: Record<CellState, string> = {
  done: 'done',
  missed: 'missed',
  open: 'not done yet',
  off: 'not scheduled',
  future: 'later',
};
export const cellLabel = (day: HabitDay, state: CellState): string =>
  `${dayText(day.date)}, ${STATE_WORD[state]}`;

/** Empty cells before the first day so the grid starts on a Monday. */
export const leadingBlanks = (firstDate: string): number =>
  isoWeekdayOfDay(dayNumberOf(firstDate)) - 1;

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Text for the tooltip, e.g. "Mon, 12 Oct". */
  title: string;
}

/** Week: Mon..Sun. Month: day numbers. Year: one bar per month with the days done. */
export function barsOf(days: readonly HabitDay[], range: HabitRange): Bar[] {
  if (range === 'year') {
    const byMonth = new Map<string, number>();
    for (const day of days) {
      const key = day.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + (day.done ? 1 : 0));
    }
    return [...byMonth].map(([key, value]) => ({
      key,
      label: SHORT_MONTH_FORMAT.format(utc(`${key}-01`)),
      value,
      title: MONTH_FORMAT.format(utc(`${key}-01`)),
    }));
  }
  return days.map((day) => ({
    key: day.date,
    label:
      range === 'week'
        ? (HABIT_WEEKDAY_NAMES[isoWeekdayOfDay(dayNumberOf(day.date)) - 1] ?? '')
        : String(Number(day.date.slice(8))),
    value: day.count,
    title: dayText(day.date),
  }));
}
