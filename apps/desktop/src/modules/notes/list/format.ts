import { clock, istDay } from '../../tasks/dates';

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const dayMonth = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
});
const dayMonthYear = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * The date shown under a note title, in India time: the clock time today ("3:05 PM"), "Yesterday",
 * or the day ("13 Oct", with the year when it is not this year).
 */
export function noteDate(iso: string, now: Date): string {
  const ms = Date.parse(iso);
  const offset = istDay(ms) - istDay(now.getTime());
  if (offset === 0) return clock(ms);
  if (offset === -1) return 'Yesterday';
  const sameYear =
    new Date(ms + IST_MS).getUTCFullYear() === new Date(now.getTime() + IST_MS).getUTCFullYear();
  return (sameYear ? dayMonth : dayMonthYear).format(ms);
}

/** Notes whose title contains the text (ignoring case). The filter works on the loaded notes only. */
export function filterByTitle<T extends { title: string }>(notes: readonly T[], text: string): T[] {
  const needle = text.trim().toLowerCase();
  return needle === ''
    ? [...notes]
    : notes.filter((note) => note.title.toLowerCase().includes(needle));
}

/** Pinned notes first; the order inside each group stays as the server sent it. */
export function pinnedFirst<T extends { pinned: boolean }>(notes: readonly T[]): T[] {
  return [...notes.filter((note) => note.pinned), ...notes.filter((note) => !note.pinned)];
}
