import type { ReportDay, ReportPeriod, TaskReport } from '@personal-os/shared';

/**
 * Pure helpers for the Reporting page. Report days are plain India dates (YYYY-MM-DD). They are
 * read as UTC parts, never with `new Date('YYYY-MM-DD')` in the browser zone, so a weekday never
 * shifts with the machine's time zone.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

interface DayParts {
  year: number;
  month: number; // 1 to 12
  day: number;
  weekday: number; // 0 = Sunday
}

function parts(date: string): DayParts {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday };
}

/** "Fri" */
export const weekdayShort = (date: string): string => WEEKDAYS[parts(date).weekday] ?? '';

/** "Fri 16 Oct" */
export function dayLabel(date: string): string {
  const { day, month, weekday } = parts(date);
  return `${WEEKDAYS[weekday] ?? ''} ${String(day)} ${MONTHS[month - 1] ?? ''}`;
}

/** "Mon 12 – Sun 18 Oct" for a week, "October 2026" for a month. */
export function periodLabel(report: Pick<TaskReport, 'period' | 'start' | 'end'>): string {
  const start = parts(report.start);
  if (report.period === 'month') {
    return `${MONTHS_LONG[start.month - 1] ?? ''} ${String(start.year)}`;
  }
  const end = parts(report.end);
  const first =
    start.month === end.month
      ? `${WEEKDAYS[start.weekday] ?? ''} ${String(start.day)}`
      : dayLabel(report.start);
  return `${first} – ${dayLabel(report.end)}`;
}

/** Whole percent of onTime / (onTime + late), rounded half up; null when nothing had a due date. */
export function onTimePercent(onTime: number, late: number): number | null {
  const total = onTime + late;
  if (total === 0) return null;
  return Math.floor((onTime * 200 + total) / (2 * total));
}

/** 1 -> "1st", 22 -> "22nd", 11 -> "11th" */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${String(n)}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${String(n)}${suffix}`;
}

/** "Last week by Fri" or "Last month by the 16th": the previous period up to the same point. */
export function comparisonName(report: Pick<TaskReport, 'period' | 'previous'>): string {
  if (report.period === 'week') return `Last week by ${weekdayShort(report.previous.end)}`;
  return `Last month by the ${ordinal(parts(report.previous.end).day)}`;
}

export const periodWord = (period: ReportPeriod): string => (period === 'week' ? 'week' : 'month');

/**
 * The text under a column on the X axis. Week: Mon to Sun. Month: the day number on the 1st and
 * on every Monday, nothing on the other days.
 */
export function axisLabel(date: string, period: ReportPeriod): string {
  const { day, weekday } = parts(date);
  if (period === 'week') return WEEKDAYS[weekday] ?? '';
  return day === 1 || weekday === 1 ? String(day) : '';
}

/** A day after today has no column. India dates compare correctly as text. */
export const isFutureDay = (date: string, today: string): boolean => date > today;

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** The hidden one-sentence summary of chart 1, e.g. "Done per day this week: 21 tasks, most on Thursday (6)." */
export function daySummary(report: Pick<TaskReport, 'period' | 'days' | 'totals'>): string {
  const lead = `Done per day this ${periodWord(report.period)}`;
  if (report.totals.done === 0) return `${lead}: no tasks done.`;
  let best: ReportDay | undefined;
  for (const day of report.days) if (!best || day.done > best.done) best = day;
  if (!best) return `${lead}: ${plural(report.totals.done, 'task', 'tasks')}.`;
  const { day, month, weekday } = parts(best.date);
  const where =
    report.period === 'week'
      ? (WEEKDAYS_LONG[weekday] ?? '')
      : `${String(day)} ${MONTHS[month - 1] ?? ''}`;
  return `${lead}: ${plural(report.totals.done, 'task', 'tasks')}, most on ${where} (${String(best.done)}).`;
}

/** Tooltip lines for one day: "Fri 16 Oct · 4 done" and "3 on time · 1 late · 1 no date". */
export function dayTooltip(day: ReportDay): { title: string; detail: string } {
  const detailParts = [`${String(day.onTime)} on time`, `${String(day.late)} late`];
  if (day.noDueDate > 0) detailParts.push(`${String(day.noDueDate)} no date`);
  return {
    title: `${dayLabel(day.date)} · ${String(day.done)} done`,
    detail: detailParts.join(' · '),
  };
}
