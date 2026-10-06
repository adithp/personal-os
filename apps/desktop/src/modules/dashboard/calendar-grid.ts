import { APP_TIMEZONE } from '@personal-os/shared';

/** A calendar day. `month` is 0–11 like JavaScript dates. */
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

export const WEEKDAYS_MONDAY_FIRST = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const monthName = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

/** Today's date in India, whatever the computer's own time zone is. */
export function todayInIndia(now: Date): CalendarDay {
  const parts = Object.fromEntries(dateParts.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** How many empty cells come before the 1st when the week starts on Monday (0–6). */
export function leadingBlanks(year: number, month: number): number {
  const sundayFirst = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/** Moves a month by whole months, rolling over the year: (2025, 11) + 1 → (2026, 0). */
export function addMonths(year: number, month: number, delta: number) {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** "October 2025" */
export function monthLabel(year: number, month: number): string {
  return monthName.format(new Date(Date.UTC(year, month, 1)));
}

export function dayKey({ year, month, day }: CalendarDay): string {
  return `${String(year)}-${String(month)}-${String(day)}`;
}

/** The day that is `offset` days after (or before, if negative) the given day. */
export function addDays(from: CalendarDay, offset: number): CalendarDay {
  const date = new Date(Date.UTC(from.year, from.month, from.day + offset));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}
