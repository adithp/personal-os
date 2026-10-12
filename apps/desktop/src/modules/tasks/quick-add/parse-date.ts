import * as chrono from 'chrono-node';
import { toIstDate } from '../dates';

/**
 * The date and time words of the quick add text, read by chrono-node in India time (UTC+05:30).
 * The British setup reads "5/10" as 5 October, but it also reads "oct 12" as October 2012, so the
 * month-first parser of the default setup replaces the British one for month names.
 */
const parser = (() => {
  const british = chrono.en.GB.clone();
  const monthFirst = chrono.en.casual.parsers.find(
    (p) => p.constructor.name === 'ENMonthNameMiddleEndianParser',
  );
  if (monthFirst) {
    british.parsers = british.parsers.map((p) =>
      p.constructor.name === 'ENMonthNameMiddleEndianParser' ? monthFirst : p,
    );
  }
  return british;
})();

/** Single words that are usually not a date ("may", "second", "now", "a"). */
const AMBIGUOUS = new Set(['may', 'march', 'sat', 'sun', 'second', 'now', 'a']);

/** Short weekday forms alone ("mon", "fri") are usually not a date; a full name or "next mon" is. */
const SHORT_WEEKDAYS = new Set(['mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri']);

const MONTH_NAME =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

export interface DateMatch {
  start: number;
  end: number;
  text: string;
  /** The time chrono worked out (UTC ms); a day without a time is noon in India. */
  ms: number;
  /** A day, weekday, month or year was written ("5pm" alone has none). */
  hasDate: boolean;
  /** An hour was written. */
  hasTime: boolean;
}

/** The first date or time in the text that is not an ambiguous word or a strange year. */
export function findDate(text: string, now: Date): DateMatch | null {
  try {
    const results = parser.parse(text, { instant: now, timezone: 330 }, { forwardDate: true });
    for (const result of results) {
      const ms = result.date().getTime();
      if (Number.isNaN(ms)) continue;
      const year = Number(toIstDate(new Date(ms).toISOString()).slice(0, 4));
      if (year < 2000 || year > 2100) continue;
      if (AMBIGUOUS.has(result.text.trim().toLowerCase())) continue;
      const certain = (key: Parameters<typeof result.start.isCertain>[0]) =>
        result.start.isCertain(key);
      if (SHORT_WEEKDAYS.has(result.text.trim().toLowerCase())) continue;
      // "Call April", "Meet June": chrono marks a lone month as the 1st (certain), so ask for a number
      if (MONTH_NAME.test(result.text) && !/\d/.test(result.text)) continue;
      return {
        start: result.index,
        end: result.index + result.text.length,
        text: result.text,
        ms,
        hasDate: certain('day') || certain('weekday') || certain('month') || certain('year'),
        hasTime: certain('hour'),
      };
    }
  } catch {
    // chrono should not throw; if it does, the text is simply not read as a date
  }
  return null;
}
