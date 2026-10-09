import { describe, expect, it } from 'vitest';
import {
  buildRecurrence,
  describeRecurrence,
  parseRecurrence,
  recurrenceRuleSchema,
  type Recurrence,
} from './recurrence';

describe('recurrence presets', () => {
  it('builds RRULE text, with weekdays in Monday-to-Sunday order and no repeats', () => {
    expect(buildRecurrence({ freq: 'daily' })).toBe('FREQ=DAILY');
    expect(buildRecurrence({ freq: 'weekly', days: ['WE', 'MO', 'WE'] })).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE',
    );
    expect(buildRecurrence({ freq: 'monthly', day: 15 })).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
    expect(buildRecurrence({ freq: 'yearly' })).toBe('FREQ=YEARLY');
  });

  it('parses what it builds', () => {
    const cases: Recurrence[] = [
      { freq: 'daily' },
      { freq: 'weekly', days: ['MO', 'FR'] },
      { freq: 'monthly', day: 31 },
      { freq: 'yearly' },
    ];
    for (const recurrence of cases) {
      expect(parseRecurrence(buildRecurrence(recurrence))).toEqual(recurrence);
    }
  });

  it('refuses anything that is not a preset', () => {
    for (const rule of [
      '',
      'FREQ=HOURLY',
      'FREQ=DAILY;INTERVAL=2',
      'FREQ=WEEKLY',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=WEEKLY;BYDAY=WE,MO',
      'FREQ=WEEKLY;BYDAY=MO,MO',
      'FREQ=MONTHLY;BYMONTHDAY=0',
      'FREQ=MONTHLY;BYMONTHDAY=32',
      'FREQ=MONTHLY',
      'RRULE:FREQ=DAILY',
    ]) {
      expect(parseRecurrence(rule), rule).toBeNull();
      expect(recurrenceRuleSchema.safeParse(rule).success, rule).toBe(false);
    }
    expect(recurrenceRuleSchema.safeParse('FREQ=DAILY').success).toBe(true);
  });

  it('describes a rule in plain words', () => {
    expect(describeRecurrence('FREQ=DAILY')).toBe('Every day');
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Every week on Mon, Wed');
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=1')).toBe('Every month on the 1st');
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=22')).toBe('Every month on the 22nd');
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=13')).toBe('Every month on the 13th');
    expect(describeRecurrence('FREQ=YEARLY')).toBe('Every year');
    expect(describeRecurrence('something else')).toBe('Repeats');
  });
});
