import { describe, expect, it } from 'vitest';
import { nextMondayStart } from './next-monday';

describe('nextMondayStart', () => {
  it('gives the coming Monday from a Tuesday', () => {
    // Tuesday 7 October 2025, 3 PM in India -> Monday 13 October, 00:00 in India
    expect(nextMondayStart(Date.parse('2025-10-07T09:30:00.000Z'))).toBe(
      '2025-10-12T18:30:00.000Z',
    );
  });

  it('gives the next day from a Sunday', () => {
    expect(nextMondayStart(Date.parse('2025-10-12T09:30:00.000Z'))).toBe(
      '2025-10-12T18:30:00.000Z',
    );
  });

  it('gives a week later on a Monday', () => {
    expect(nextMondayStart(Date.parse('2025-10-13T09:30:00.000Z'))).toBe(
      '2025-10-19T18:30:00.000Z',
    );
  });

  it('uses the India day just after midnight there, when UTC is still the day before', () => {
    // 00:10 IST on Monday 13 October is Sunday 18:40 in UTC: still Monday in India
    expect(nextMondayStart(Date.parse('2025-10-12T18:40:00.000Z'))).toBe(
      '2025-10-19T18:30:00.000Z',
    );
    // 23:50 IST on Sunday 12 October
    expect(nextMondayStart(Date.parse('2025-10-12T18:20:00.000Z'))).toBe(
      '2025-10-12T18:30:00.000Z',
    );
  });

  it('crosses a month end and a leap day', () => {
    // 2028 is a leap year: Tuesday 29 February 2028 -> Monday 6 March
    expect(nextMondayStart(Date.parse('2028-02-29T06:30:00.000Z'))).toBe(
      '2028-03-05T18:30:00.000Z',
    );
    // Wednesday 31 December 2025 -> Monday 5 January 2026
    expect(nextMondayStart(Date.parse('2025-12-31T06:30:00.000Z'))).toBe(
      '2026-01-04T18:30:00.000Z',
    );
  });
});
