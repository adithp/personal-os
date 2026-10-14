import { MAX_PAISE } from '@personal-os/shared';

/**
 * Typed rupees to integer paise with integer math only ("1,234.50" is 123450). Commas, spaces and
 * a rupee sign are ignored; at most 2 decimals. Null for anything else (letters, 3 decimals,
 * a second dot, too large). A minus sign is accepted only with `allowNegative`.
 */
export function parseRupees(
  text: string,
  options: { allowNegative?: boolean } = {},
): number | null {
  const cleaned = text.replace(/[\s,₹]/g, '');
  const match = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  if (match[1] && !options.allowNegative) return null;
  const whole = Number(match[2]);
  const fraction = Number((match[3] ?? '').padEnd(2, '0'));
  const paise = whole * 100 + fraction;
  if (paise > MAX_PAISE) return null;
  return match[1] && paise > 0 ? -paise : paise;
}

/** Paise as text for an input: 123450 is "1234.50", 120000 is "1200". */
export function rupeesText(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return fraction === 0
    ? `${sign}${String(whole)}`
    : `${sign}${String(whole)}.${String(fraction).padStart(2, '0')}`;
}

const dateOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const shortFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Today", "Yesterday" or "Wed, 14 Oct" for a day string. */
export function dayHeading(day: string, today: string): string {
  if (day === today) return 'Today';
  const yesterday = new Date(dateOf(today).getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (day === yesterday) return 'Yesterday';
  return dayFormat.format(dateOf(day));
}

/** "14 Oct" */
export const shortDay = (day: string): string => shortFormat.format(dateOf(day));

/** "October 2026" for "2026-10". */
export const monthLabel = (month: string): string => monthFormat.format(dateOf(`${month}-01`));

/** "+12% vs last month"; null when there is nothing to compare with. */
export function changeText(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const percent = Math.round(((current - previous) * 100) / previous);
  if (percent === 0) return 'Same as last month';
  return `${percent > 0 ? '+' : ''}${String(percent)}% vs last month`;
}

/** When a renewal is due, in words: "Overdue by 3 days", "Today", "Tomorrow", "In 5 days". */
export function renewalText(daysUntil: number): string {
  if (daysUntil < 0) {
    const days = -daysUntil;
    return `Overdue by ${String(days)} ${days === 1 ? 'day' : 'days'}`;
  }
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `In ${String(daysUntil)} days`;
}
