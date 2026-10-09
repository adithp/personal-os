import type { TaskPriority } from '@personal-os/shared';

/**
 * Quick add understanding (Feature 4): turns "Pay rent tomorrow 5pm #home !high every month" into
 * a title plus fields. Pure function; owned by the Feature 4 parse agent.
 * CONTRACT STUB: for now it understands nothing and returns the whole text as the title.
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
  /** The text without the understood parts (spaces tidied). Never empty when the input has words. */
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

/**
 * `now` is the current time (the dates are worked out in India time, Asia/Kolkata).
 * Parts whose key is in `ignored` stay in the title and are not applied.
 */
export function parseQuickAdd(
  input: string,
  _now: Date,
  _ignored: ReadonlySet<string> = new Set(),
): ParsedQuickAdd {
  return {
    title: input.trim(),
    dueAt: null,
    dueAllDay: false,
    priority: null,
    tagNames: [],
    recurrenceRule: null,
    parts: [],
  };
}
