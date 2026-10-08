import { describe, expect, it } from 'vitest';
import {
  dueLabel,
  fromIstDate,
  fromIstInput,
  istDayStartPlus,
  startOfIstDay,
  toIstDate,
  toIstInput,
} from './dates';

describe('toIstInput / fromIstInput (India time, UTC+05:30)', () => {
  it('shows a UTC time as the India wall clock', () => {
    expect(toIstInput('2025-10-07T11:30:00.000Z')).toBe('2025-10-07T17:00');
    // Crossing midnight: 20:00 UTC is 01:30 the next day in India
    expect(toIstInput('2025-12-31T20:00:00.000Z')).toBe('2026-01-01T01:30');
  });

  it('turns what you typed (India time) into UTC', () => {
    expect(fromIstInput('2025-10-07T17:00')).toBe('2025-10-07T11:30:00.000Z');
    expect(fromIstInput('2026-01-01T01:30')).toBe('2025-12-31T20:00:00.000Z');
    expect(fromIstInput('2025-10-07T00:10')).toBe('2025-10-06T18:40:00.000Z');
  });

  it('round-trips', () => {
    for (const iso of ['2025-03-31T18:29:00.000Z', '2024-02-29T23:59:00.000Z']) {
      expect(fromIstInput(toIstInput(iso))).toBe(iso);
    }
  });

  it('gives an empty string for no date and null for an empty or half-typed box', () => {
    expect(toIstInput(null)).toBe('');
    expect(toIstInput('garbage')).toBe('');
    expect(fromIstInput('')).toBeNull();
    expect(fromIstInput('2025-10-07')).toBeNull();
    expect(fromIstInput('2025-13-45T99:99')).toBeNull();
  });
});

describe('dueLabel', () => {
  // 12:00 noon in India on Tuesday 7 October 2025
  const now = new Date('2025-10-07T06:30:00.000Z');

  it('says Today, Tomorrow, and Yesterday by the India calendar day', () => {
    expect(dueLabel('2025-10-07T11:30:00.000Z', now).text).toBe('Today, 5:00 PM');
    expect(dueLabel('2025-10-08T03:30:00.000Z', now).text).toBe('Tomorrow, 9:00 AM');
    expect(dueLabel('2025-10-06T11:30:00.000Z', now).text).toBe('Yesterday, 5:00 PM');
  });

  it('uses India days, not UTC days (11 pm in India on the 7th is still the 7th)', () => {
    expect(dueLabel('2025-10-07T17:30:00.000Z', now).text).toBe('Today, 11:00 PM');
    expect(dueLabel('2025-10-07T18:30:00.000Z', now).text).toBe('Tomorrow, 12:00 AM');
  });

  it('shows weekday and date for other days, with the year when it is not this year', () => {
    expect(dueLabel('2025-10-13T06:30:00.000Z', now).text).toMatch(/Mon,? 13 Oct/);
    expect(dueLabel('2026-02-03T06:30:00.000Z', now).text).toContain('2026');
  });

  it('is overdue by day: a task due today is never overdue, even when its time has passed', () => {
    const today = dueLabel('2025-10-07T03:30:00.000Z', now); // 9:00 AM today, now is 12:00
    expect(today).toMatchObject({ overdue: false, timePassed: true });
    expect(dueLabel('2025-10-07T11:30:00.000Z', now)).toMatchObject({
      overdue: false,
      timePassed: false,
    });
    expect(dueLabel('2025-10-06T11:30:00.000Z', now)).toMatchObject({ overdue: true });
  });

  it('never shows overdue or a passed time for a done task', () => {
    expect(dueLabel('2025-10-06T11:30:00.000Z', now, true).overdue).toBe(false);
    expect(dueLabel('2025-10-07T03:30:00.000Z', now, true).timePassed).toBe(false);
  });

  it('shows an all-day task as a date only, with no time and no red time', () => {
    // All-day Oct 7 is stored as the start of that day in India time
    const allDay = '2025-10-06T18:30:00.000Z';
    expect(dueLabel(allDay, now, false, true)).toEqual({
      text: 'Today',
      overdue: false,
      timePassed: false,
    });
    expect(dueLabel('2025-10-07T18:30:00.000Z', now, false, true).text).toBe('Tomorrow');
    expect(dueLabel('2025-10-05T18:30:00.000Z', now, false, true)).toMatchObject({
      text: 'Yesterday',
      overdue: true,
    });
  });
});

describe('India calendar days', () => {
  it('turns dates to and from UTC start-of-day', () => {
    expect(fromIstDate('2025-10-07')).toBe('2025-10-06T18:30:00.000Z');
    expect(toIstDate('2025-10-06T18:30:00.000Z')).toBe('2025-10-07');
    expect(toIstDate('2025-10-07T18:29:00.000Z')).toBe('2025-10-07');
    expect(toIstDate(null)).toBe('');
    expect(fromIstDate('2025-10')).toBeNull();
  });

  it('finds the start of today and of a later day in India time', () => {
    const noon = Date.parse('2025-10-07T06:30:00.000Z');
    expect(startOfIstDay(noon)).toBe('2025-10-06T18:30:00.000Z');
    expect(istDayStartPlus(noon, 1)).toBe('2025-10-07T18:30:00.000Z');
    // 00:10 in India is already the new day, although UTC is still the 6th
    expect(startOfIstDay(Date.parse('2025-10-06T18:40:00.000Z'))).toBe('2025-10-06T18:30:00.000Z');
  });
});
