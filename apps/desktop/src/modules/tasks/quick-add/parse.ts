import {
  buildRecurrence,
  describeRecurrence,
  TASK_PRIORITY_LABELS,
  type TaskPriority,
} from '@personal-os/shared';
import { clock, dueLabel, istDay, istDayStartPlus, startOfIstDay } from '../dates';
import { findDate } from './parse-date';
import { findRepeat, firstOccurrence, resolveRepeat } from './parse-repeat';

/**
 * Quick add understanding (Feature 4): turns "Pay rent tomorrow 5pm #home !high every month" into
 * a title plus fields. Pure function; every time is worked out in India time (Asia/Kolkata).
 */

export type QuickAddPartKind = 'date' | 'priority' | 'tag' | 'repeat';

/** One piece of the typed text that was understood. */
export interface QuickAddPart {
  kind: QuickAddPartKind;
  /** The typed words, for example "tomorrow 5pm", "!high", "#home", "every monday". */
  text: string;
  /** Where it sits in the input (start inclusive, end exclusive). */
  start: number;
  end: number;
  /** How the bar shows it, for example "Tomorrow, 5:00 PM", "High", "home", "Every week on Mon". */
  label: string;
}

export interface ParsedQuickAdd {
  /** The text without the understood parts (spaces tidied). Empty when only parts were typed. */
  title: string;
  /** UTC ISO time, or null. A date without a time is the start of that India day with dueAllDay. */
  dueAt: string | null;
  dueAllDay: boolean;
  priority: TaskPriority | null;
  /** Tag names without the #, in the order typed, without repeats (ignoring capitals). */
  tagNames: string[];
  /** One of the repeat presets, or null. A repeat needs a due date: "every monday" alone sets the next Monday. */
  recurrenceRule: string | null;
  parts: QuickAddPart[];
}

/** Keys of parts the user switched off in the bar: `${kind}:${text}` (see partKey). */
export const partKey = (part: Pick<QuickAddPart, 'kind' | 'text'>) => `${part.kind}:${part.text}`;

const TAG = /(^|\s)#(\S+)/g;
const TAG_TRAILING = /[.,;:!?]+$/;
const TAG_MAX = 40;
const PRIORITY = /(^|\s)!(1|2|3|4|urgent|high|medium|low)(?=\s|$)/i;
const PRIORITY_WORDS: Record<string, TaskPriority> = { urgent: 1, high: 2, medium: 3, low: 4 };

/** Understood text is blanked with this (not a space, so "tomorrow #x 5pm" is not read as one date). */
const BLANK = '\u0001';
const blank = (text: string, start: number, end: number) =>
  text.slice(0, start) + BLANK.repeat(end - start) + text.slice(end);

/** The chip text for a date: the usual due wording, plus the time for a timed date on a farther day. */
function dateChipLabel(dueAt: string, now: Date, allDay: boolean): string {
  const text = dueLabel(dueAt, now, false, allDay).text;
  return allDay || /\d:\d\d/.test(text) ? text : `${text}, ${clock(Date.parse(dueAt))}`;
}

/**
 * `now` is the current time (the dates are worked out in India time, Asia/Kolkata).
 * Parts whose key is in `ignored` stay in the title and are not applied.
 */
export function parseQuickAdd(
  input: string,
  now: Date,
  ignored: ReadonlySet<string> = new Set(),
): ParsedQuickAdd {
  const parts: QuickAddPart[] = [];
  // Words found in the text are blanked even when switched off, so they never turn into a date
  let masked = input;
  const take = (kind: QuickAddPartKind, start: number, end: number, label: string) => {
    masked = blank(masked, start, end);
    const part = { kind, text: input.slice(start, end), start, end, label };
    if (ignored.has(partKey(part))) return null;
    parts.push(part);
    return part;
  };

  // Tags: "#word" at the start or after a space
  const tagNames: string[] = [];
  for (const match of input.matchAll(TAG)) {
    const name = (match[2] ?? '').replace(TAG_TRAILING, '');
    if (name.length < 1 || name.length > TAG_MAX || name.includes('#')) continue;
    const start = match.index + (match[1] ?? '').length;
    if (!take('tag', start, start + 1 + name.length, name)) continue;
    if (!tagNames.some((known) => known.toLowerCase() === name.toLowerCase())) tagNames.push(name);
  }

  // Priority: the first one counts, later ones stay in the title
  let priority: TaskPriority | null = null;
  const priorityMatch = PRIORITY.exec(masked);
  if (priorityMatch) {
    const word = (priorityMatch[2] ?? '').toLowerCase();
    const value = PRIORITY_WORDS[word] ?? (Number(word) as TaskPriority);
    const start = priorityMatch.index + (priorityMatch[1] ?? '').length;
    if (
      take(
        'priority',
        start,
        priorityMatch.index + priorityMatch[0].length,
        TASK_PRIORITY_LABELS[value],
      )
    ) {
      priority = value;
    }
  }

  // Repeat words go before the date is read, so "every monday" is not the date "monday"
  const repeatMatch = findRepeat(masked);
  const repeatOn = repeatMatch && !ignored.has(partKey({ kind: 'repeat', text: repeatMatch.text }));
  if (repeatMatch) masked = blank(masked, repeatMatch.start, repeatMatch.end);

  const dateMatch = findDate(masked, now);
  const date =
    dateMatch && !ignored.has(partKey({ kind: 'date', text: dateMatch.text })) ? dateMatch : null;

  // Due date: the typed date; a repeat with no date starts on its first day on or after today
  const today = istDay(now.getTime());
  const dayStart = (day: number) => Date.parse(istDayStartPlus(now.getTime(), day - today));
  let dueMs: number | null = null;
  let dueAllDay = false;
  let dueDay: number | null = null;
  if (date && !(repeatOn && !date.hasDate)) {
    dueDay = istDay(date.ms);
    dueAllDay = !date.hasTime;
    dueMs = dueAllDay ? Date.parse(startOfIstDay(date.ms)) : date.ms;
  }
  let recurrenceRule: string | null = null;
  if (repeatMatch && repeatOn) {
    const recurrence = resolveRepeat(repeatMatch.spec, dueDay ?? today);
    recurrenceRule = buildRecurrence(recurrence);
    if (dueMs === null) {
      dueDay = firstOccurrence(recurrence, today);
      dueMs = dayStart(dueDay);
      dueAllDay = true;
      if (date) {
        // "every monday at 9am": the time of day goes onto the first Monday
        dueMs += date.ms - Date.parse(startOfIstDay(date.ms));
        dueAllDay = false;
      }
    }
    parts.push({
      kind: 'repeat',
      text: repeatMatch.text,
      start: repeatMatch.start,
      end: repeatMatch.end,
      label: describeRecurrence(recurrenceRule),
    });
  }
  const dueAt = dueMs === null ? null : new Date(dueMs).toISOString();
  if (date && dueAt) {
    parts.push({
      kind: 'date',
      text: date.text,
      start: date.start,
      end: date.end,
      label: dateChipLabel(dueAt, now, dueAllDay),
    });
  }

  parts.sort((a, b) => a.start - b.start);
  let title = input;
  for (const part of [...parts].reverse()) {
    title = title.slice(0, part.start) + ' ' + title.slice(part.end);
  }
  return {
    title: title.replace(/\s+/g, ' ').trim(),
    dueAt,
    dueAllDay: dueAt ? dueAllDay : false,
    priority,
    tagNames,
    recurrenceRule,
    parts,
  };
}
