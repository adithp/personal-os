const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});

/** "Edited just now", "Edited 2 min ago", "Edited 3 h ago", then the date in India time. */
export function editedLabel(updatedAt: string, now: number): string {
  const time = Date.parse(updatedAt);
  const age = Math.max(0, now - time);
  if (age < MINUTE) return 'Edited just now';
  if (age < HOUR) return `Edited ${String(Math.floor(age / MINUTE))} min ago`;
  if (age < 24 * HOUR) return `Edited ${String(Math.floor(age / HOUR))} h ago`;
  return `Edited ${dayFormat.format(time)}`;
}
