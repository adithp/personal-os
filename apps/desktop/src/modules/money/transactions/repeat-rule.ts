import { buildRecurrence, type Weekday } from '@personal-os/shared';

export type RepeatKind = 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatChoice {
  kind: RepeatKind;
  /** For weekly: the chosen weekdays. */
  days: Weekday[];
}

const WEEKDAY_OF_NUMBER: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** The weekday of a day string (YYYY-MM-DD). */
export function weekdayOf(day: string): Weekday {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return WEEKDAY_OF_NUMBER[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? 'MO';
}

/** The repeat rule text of a choice for a first day; null for "never" (or weekly with no day). */
export function ruleOf(choice: RepeatChoice, firstDay: string): string | null {
  switch (choice.kind) {
    case 'never':
      return null;
    case 'daily':
      return buildRecurrence({ freq: 'daily' });
    case 'weekly':
      return choice.days.length > 0 ? buildRecurrence({ freq: 'weekly', days: choice.days }) : null;
    case 'monthly':
      return buildRecurrence({ freq: 'monthly', day: Number(firstDay.slice(8, 10)) });
    case 'yearly':
      return buildRecurrence({ freq: 'yearly' });
  }
}
