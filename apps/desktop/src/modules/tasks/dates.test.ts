import { describe, expect, it } from 'vitest';
import { dueLabel, fromIstInput, toIstInput } from './dates';

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

  it('is overdue only when the time has passed and the task is not done', () => {
    expect(dueLabel('2025-10-07T05:00:00.000Z', now).overdue).toBe(true);
    expect(dueLabel('2025-10-07T05:00:00.000Z', now, true).overdue).toBe(false);
    expect(dueLabel('2025-10-07T11:30:00.000Z', now).overdue).toBe(false);
  });
});
