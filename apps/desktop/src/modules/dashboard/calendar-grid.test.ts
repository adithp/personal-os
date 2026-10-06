import { describe, expect, it } from 'vitest';
import {
  WEEKDAYS_MONDAY_FIRST,
  addDays,
  addMonths,
  dayKey,
  daysInMonth,
  leadingBlanks,
  monthLabel,
  todayInIndia,
} from './calendar-grid';

describe('weekday header', () => {
  it('starts on Monday', () => {
    expect(WEEKDAYS_MONDAY_FIRST).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });
});

describe('leadingBlanks (Monday first)', () => {
  it.each([
    [2025, 9, 2], // 1 October 2025 is a Wednesday
    [2025, 5, 6], // 1 June 2025 is a Sunday
    [2025, 8, 0], // 1 September 2025 is a Monday
    [2024, 1, 3], // 1 February 2024 is a Thursday
    [2026, 0, 3], // 1 January 2026 is a Thursday
  ])('%s-%s starts after %s empty cells', (year, month, blanks) => {
    expect(leadingBlanks(year, month)).toBe(blanks);
  });
});

describe('daysInMonth', () => {
  it.each([
    [2025, 0, 31],
    [2025, 1, 28],
    [2024, 1, 29], // leap year
    [2100, 1, 28], // not a leap year
    [2000, 1, 29], // leap year
    [2025, 3, 30],
    [2025, 11, 31],
  ])('%s-%s has %s days', (year, month, days) => {
    expect(daysInMonth(year, month)).toBe(days);
  });
});

describe('addMonths', () => {
  it('rolls over the year in both directions', () => {
    expect(addMonths(2025, 11, 1)).toEqual({ year: 2026, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2025, 9, 15)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2025, 0, -13)).toEqual({ year: 2023, month: 11 });
    expect(addMonths(2025, 5, 0)).toEqual({ year: 2025, month: 5 });
  });
});

describe('monthLabel', () => {
  it('shows the month name and year', () => {
    expect(monthLabel(2025, 9)).toBe('October 2025');
    expect(monthLabel(2026, 0)).toBe('January 2026');
  });
});

describe('todayInIndia', () => {
  it('uses the India date, which can be a day ahead of UTC', () => {
    expect(todayInIndia(new Date('2025-10-06T23:30:00Z'))).toEqual({
      year: 2025,
      month: 9,
      day: 7,
    });
    expect(todayInIndia(new Date('2025-10-06T18:29:00Z'))).toEqual({
      year: 2025,
      month: 9,
      day: 6,
    });
  });

  it('rolls over a month and a year', () => {
    expect(todayInIndia(new Date('2025-12-31T18:30:00Z'))).toEqual({
      year: 2026,
      month: 0,
      day: 1,
    });
    expect(todayInIndia(new Date('2025-10-31T20:00:00Z'))).toEqual({
      year: 2025,
      month: 10,
      day: 1,
    });
  });
});

describe('addDays and dayKey', () => {
  it('moves across month ends', () => {
    expect(addDays({ year: 2025, month: 9, day: 30 }, 3)).toEqual({
      year: 2025,
      month: 10,
      day: 2,
    });
    expect(addDays({ year: 2025, month: 0, day: 2 }, -3)).toEqual({
      year: 2024,
      month: 11,
      day: 30,
    });
    expect(addDays({ year: 2024, month: 1, day: 28 }, 1)).toEqual({
      year: 2024,
      month: 1,
      day: 29,
    });
  });

  it('makes one key per day', () => {
    expect(dayKey({ year: 2025, month: 9, day: 7 })).toBe('2025-9-7');
    expect(dayKey({ year: 2025, month: 9, day: 7 })).not.toBe(
      dayKey({ year: 2025, month: 8, day: 7 }),
    );
  });
});
