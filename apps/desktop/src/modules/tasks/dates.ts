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
function istDay(ms: number): number {
  return Math.floor((ms + IST_MS) / DAY_MS);
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

const clock = (ms: number) =>
  time.format(ms).replace(/\s?([ap])m/i, (_m, c: string) => ` ${c.toUpperCase()}M`);

export interface DueLabel {
  text: string;
  overdue: boolean;
}

/**
 * Short text for a due date: "Today, 5:00 PM", "Tomorrow, 9:00 AM", "Yesterday, ...", "Mon, 13 Oct",
 * or with the year when it is not this year. Overdue means the time has passed.
 */
export function dueLabel(iso: string, now: Date, done = false): DueLabel {
  const ms = Date.parse(iso);
  const offset = istDay(ms) - istDay(now.getTime());
  const at = clock(ms);
  let text: string;
  if (offset === 0) text = `Today, ${at}`;
  else if (offset === 1) text = `Tomorrow, ${at}`;
  else if (offset === -1) text = `Yesterday, ${at}`;
  else {
    const sameYear =
      new Date(ms + IST_MS).getUTCFullYear() === new Date(now.getTime() + IST_MS).getUTCFullYear();
    text = (sameYear ? dayMonth : dayMonthYear).format(ms);
  }
  return { text, overdue: !done && ms < now.getTime() };
}
