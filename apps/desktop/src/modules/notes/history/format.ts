import type { NoteVersionSummary } from '@personal-os/shared';
import { istDay, toIstDate, toIstInput } from '../../tasks/dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14:32": the India wall-clock time of a version. */
export const versionTime = (iso: string): string => toIstInput(iso).slice(11, 16);

/** "13 Oct" (with the year when it is not this year), in India time. */
function dayMonth(iso: string, now: number): string {
  const [year = '', month = '1', day = '1'] = toIstDate(iso).split('-');
  const thisYear = toIstDate(new Date(now).toISOString()).slice(0, 4);
  const text = `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? ''}`;
  return year === thisYear ? text : `${text} ${year}`;
}

/** "Version from 13 Oct, 14:32" */
export const versionTitle = (iso: string, now: number): string =>
  `Version from ${dayMonth(iso, now)}, ${versionTime(iso)}`;

/** The heading of a day group: Today, Yesterday, or "13 Oct". */
export function dayHeading(iso: string, now: number): string {
  const offset = istDay(now) - istDay(Date.parse(iso));
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return dayMonth(iso, now);
}

/** "+120 words", "−8 words" (a real minus sign), "No change in words". */
export function deltaLabel(delta: number): string {
  if (delta === 0) return 'No change in words';
  const size = Math.abs(delta);
  return `${delta > 0 ? '+' : '−'}${String(size)} ${size === 1 ? 'word' : 'words'}`;
}

export const REASON_WORD: Record<NoteVersionSummary['reason'], string | null> = {
  auto: null,
  before_restore: 'Before restore',
  conflict: 'Conflict',
};

export interface DayGroup {
  day: string;
  heading: string;
  versions: NoteVersionSummary[];
}

/** Versions (newest first) grouped by their India calendar day, in the same order. */
export function groupByDay(versions: NoteVersionSummary[], now: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const version of versions) {
    const day = toIstDate(version.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.versions.push(version);
    else groups.push({ day, heading: dayHeading(version.createdAt, now), versions: [version] });
  }
  return groups;
}
