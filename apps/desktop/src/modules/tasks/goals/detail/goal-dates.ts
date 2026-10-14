const day = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
});
const dayYear = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const year = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' });

/** "31 Dec" in India time; the year is added when it is not this year ("31 Dec 2027"). */
export function shortDate(iso: string, now: Date): string {
  const time = new Date(iso);
  return year.format(time) === year.format(now) ? day.format(time) : dayYear.format(time);
}
