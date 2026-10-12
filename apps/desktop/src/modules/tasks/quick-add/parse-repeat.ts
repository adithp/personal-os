import { WEEKDAYS, type Recurrence, type Weekday } from '@personal-os/shared';

/**
 * Repeat words of the quick add text ("every monday and thursday", "monthly", ...) and the first
 * date of a repeat. Days are India calendar days counted as whole days since 1970 (`istDay`), so
 * no time zone work is needed here.
 */

const DAY_WORDS: Record<string, Weekday> = {
  mon: 'MO',
  monday: 'MO',
  tue: 'TU',
  tues: 'TU',
  tuesday: 'TU',
  wed: 'WE',
  wednesday: 'WE',
  thu: 'TH',
  thur: 'TH',
  thurs: 'TH',
  thursday: 'TH',
  fri: 'FR',
  friday: 'FR',
  sat: 'SA',
  saturday: 'SA',
  sun: 'SU',
  sunday: 'SU',
};

const DAY =
  '(?:monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)';
const DAY_LIST = `${DAY}(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)${DAY})*`;
const REPEAT = new RegExp(
  `(?<!\\w)(?:every\\s+(?:(${DAY_LIST})|(day|week|weekday|year)|month(?:\\s+on(?:\\s+the)?\\s+([12]\\d|3[01]|[1-9])(?:st|nd|rd|th)?)?)|(daily|weekly|monthly|yearly|annually))(?!\\w)`,
  'i',
);

/** A repeat as typed. `null` days or day means "the weekday / day of the month of the due date". */
export type RepeatSpec =
  | { freq: 'daily' }
  | { freq: 'weekly'; days: Weekday[] | null }
  | { freq: 'monthly'; day: number | null }
  | { freq: 'yearly' };

export interface RepeatMatch {
  start: number;
  end: number;
  text: string;
  spec: RepeatSpec;
}

const WORKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

function toSpec(match: RegExpExecArray): RepeatSpec {
  const [, dayList, unit, monthDay, single] = match;
  if (dayList) {
    const words = dayList.toLowerCase().match(/[a-z]+/g) ?? [];
    const days = words.flatMap((word) => DAY_WORDS[word] ?? []);
    return { freq: 'weekly', days: WEEKDAYS.filter((day) => days.includes(day)) };
  }
  const word = (unit ?? single ?? '').toLowerCase();
  if (word === 'day' || word === 'daily') return { freq: 'daily' };
  if (word === 'week' || word === 'weekly') return { freq: 'weekly', days: null };
  if (word === 'weekday') return { freq: 'weekly', days: WORKDAYS };
  if (word === 'year' || word === 'yearly' || word === 'annually') return { freq: 'yearly' };
  return { freq: 'monthly', day: monthDay ? Number(monthDay) : null };
}

/** The first repeat in the text, or null. */
export function findRepeat(text: string): RepeatMatch | null {
  const match = REPEAT.exec(text);
  if (!match) return null;
  return {
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
    spec: toSpec(match),
  };
}

/** 0 = Monday ... 6 = Sunday. 1 January 1970 (day 0) was a Thursday. */
const weekdayIndex = (day: number) => (((day + 3) % 7) + 7) % 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayParts = (day: number) => {
  const date = new Date(day * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), date: date.getUTCDate() };
};

/** Fills the blanks of a repeat from the due day (its weekday, its day of the month). */
export function resolveRepeat(spec: RepeatSpec, dueDay: number): Recurrence {
  if (spec.freq === 'weekly') {
    return { freq: 'weekly', days: spec.days ?? [WEEKDAYS[weekdayIndex(dueDay)] ?? 'MO'] };
  }
  if (spec.freq === 'monthly') return { freq: 'monthly', day: spec.day ?? dayParts(dueDay).date };
  return spec;
}

/** The first day on or after `fromDay` that the repeat falls on. */
export function firstOccurrence(recurrence: Recurrence, fromDay: number): number {
  if (recurrence.freq === 'weekly') {
    for (let step = 0; step < 7; step++) {
      const weekday = WEEKDAYS[weekdayIndex(fromDay + step)];
      if (weekday && recurrence.days.includes(weekday)) return fromDay + step;
    }
  }
  if (recurrence.freq === 'monthly') {
    const { year, month } = dayParts(fromDay);
    // Like the server: in a month without day 29, 30 or 31 the last day of the month is used
    for (let ahead = 0; ahead < 2; ahead++) {
      const length = new Date(Date.UTC(year, month + ahead + 1, 0)).getUTCDate();
      const day = Date.UTC(year, month + ahead, Math.min(recurrence.day, length)) / DAY_MS;
      if (day >= fromDay) return day;
    }
  }
  return fromDay;
}
