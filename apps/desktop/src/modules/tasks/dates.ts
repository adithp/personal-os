/**
 * Times are stored in UTC and shown in India time (Asia/Kolkata, UTC+05:30, no daylight saving).
 * Because India has a fixed offset, a date typed in a "datetime-local" box can be turned into UTC
 * with plain arithmetic; no time zone library is needed.
 */
export const IST_OFFSET = '+05:30';
const IST_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC time -> "2025-10-07T17:00" (the wall clock in India), for a datetime-local box. */
export function toIstInput(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms + IST_MS).toISOString().slice(0, 16);
}

/** "2025-10-07T17:00" typed in India time -> UTC ISO time, or null when empty or incomplete. */
export function fromIstInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00${IST_OFFSET}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** The India calendar day of a time, as whole days since 1970 (for comparing days). */
export function istDay(ms: number): number {
  return Math.floor((ms + IST_MS) / DAY_MS);
}

/** "2025-10-07": the India calendar date of a UTC time, for a date box. */
export function toIstDate(iso: string | null): string {
  return toIstInput(iso).slice(0, 10);
}

/** "2025-10-07" -> the start of that day in India time as UTC ISO (2025-10-06T18:30:00.000Z). */
export function fromIstDate(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? fromIstInput(`${date}T00:00`) : null;
}

/** The start of the India calendar day that contains this time, as UTC ISO. */
export function startOfIstDay(ms: number): string {
  return new Date(istDay(ms) * DAY_MS - IST_MS).toISOString();
}

/** Start of the day that is `days` after the India day containing `ms`, as UTC ISO. */
export function istDayStartPlus(ms: number, days: number): string {
  return new Date((istDay(ms) + days) * DAY_MS - IST_MS).toISOString();
}

const time = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const dayMonth = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const dayMonthYear = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const clock = (ms: number) =>
  time.format(ms).replace(/\s?([ap])m/i, (_m, c: string) => ` ${c.toUpperCase()}M`);

export interface DueLabel {
  text: string;
  /** The due DAY is before today (India time). A task due today is never overdue. */
  overdue: boolean;
  /** Due today at a time that has already passed: show the time in red. */
  timePassed: boolean;
}

/**
 * Short text for a due date: "Today, 5:00 PM", "Tomorrow, 9:00 AM", "Yesterday, ...", "Mon, 13 Oct",
 * or with the year when it is not this year. An all-day task shows no time ("Today", "Tomorrow").
 * Overdue is by day (docs/features/tasks.md): due on an earlier India day than today.
 */
export function dueLabel(iso: string, now: Date, done = false, allDay = false): DueLabel {
  const ms = Date.parse(iso);
  const offset = istDay(ms) - istDay(now.getTime());
  const at = clock(ms);
  const withTime = (day: string) => (allDay ? day : `${day}, ${at}`);
  let text: string;
  if (offset === 0) text = withTime('Today');
  else if (offset === 1) text = withTime('Tomorrow');
  else if (offset === -1) text = withTime('Yesterday');
  else {
    const sameYear =
      new Date(ms + IST_MS).getUTCFullYear() === new Date(now.getTime() + IST_MS).getUTCFullYear();
    text = (sameYear ? dayMonth : dayMonthYear).format(ms);
  }
  return {
    text,
    overdue: !done && offset < 0,
    timePassed: !done && !allDay && offset === 0 && ms < now.getTime(),
  };
}
