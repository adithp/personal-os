import { z } from 'zod';

/**
 * Recurrence rules for tasks. A rule is stored as RRULE text, but only these presets exist (there
 * is no free-text rule field): every day, every week on chosen days, every month on a day of the
 * month, every year. The next date is worked out on the server (apps/server/src/actions/recurrence.ts).
 */
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

export type Recurrence =
  | { freq: 'daily' }
  | { freq: 'weekly'; days: Weekday[] }
  | { freq: 'monthly'; day: number }
  | { freq: 'yearly' };

/** The preset as RRULE text, for example `FREQ=WEEKLY;BYDAY=MO,WE`. */
export function buildRecurrence(recurrence: Recurrence): string {
  switch (recurrence.freq) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekly': {
      const days = WEEKDAYS.filter((day) => recurrence.days.includes(day));
      return `FREQ=WEEKLY;BYDAY=${days.join(',')}`;
    }
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${String(recurrence.day)}`;
    case 'yearly':
      return 'FREQ=YEARLY';
  }
}

/** The preset behind a rule, or null when the text is not one of the presets. */
export function parseRecurrence(rule: string): Recurrence | null {
  if (rule === 'FREQ=DAILY') return { freq: 'daily' };
  if (rule === 'FREQ=YEARLY') return { freq: 'yearly' };
  const weekly = /^FREQ=WEEKLY;BYDAY=([A-Z]{2}(?:,[A-Z]{2})*)$/.exec(rule);
  if (weekly?.[1]) {
    const days = weekly[1].split(',');
    const valid = WEEKDAYS.filter((day) => days.includes(day));
    // Every day must be a weekday, once, in Monday-to-Sunday order
    if (valid.length === days.length && valid.every((day, index) => day === days[index])) {
      return { freq: 'weekly', days: valid };
    }
    return null;
  }
  const monthly = /^FREQ=MONTHLY;BYMONTHDAY=(\d{1,2})$/.exec(rule);
  if (monthly?.[1]) {
    const day = Number(monthly[1]);
    if (day >= 1 && day <= 31) return { freq: 'monthly', day };
  }
  return null;
}

const ordinal = (day: number) => {
  const tail = day % 100;
  if (tail >= 11 && tail <= 13) return `${String(day)}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th';
  return `${String(day)}${suffix}`;
};

/** "Every day", "Every week on Mon, Wed", "Every month on the 15th", "Every year". */
export function describeRecurrence(rule: string): string {
  const recurrence = parseRecurrence(rule);
  if (!recurrence) return 'Repeats';
  switch (recurrence.freq) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return `Every week on ${recurrence.days.map((day) => WEEKDAY_NAMES[day]).join(', ')}`;
    case 'monthly':
      return `Every month on the ${ordinal(recurrence.day)}`;
    case 'yearly':
      return 'Every year';
  }
}

/** A rule text that is one of the presets. */
export const recurrenceRuleSchema = z.string().refine((rule) => parseRecurrence(rule) !== null, {
  message: 'Use one of the repeat options (daily, weekly, monthly, yearly)',
});
