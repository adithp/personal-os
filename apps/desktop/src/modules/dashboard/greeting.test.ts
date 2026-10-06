import { describe, expect, it } from 'vitest';
import { formatDashboardDate, greetingFor, istHour } from './greeting';

// India is UTC+5:30 all year (no daylight saving).
const at = (iso: string) => new Date(iso);

describe('istHour', () => {
  it('converts UTC to India time', () => {
    expect(istHour(at('2025-10-06T00:00:00Z'))).toBe(5);
    expect(istHour(at('2025-10-06T06:29:00Z'))).toBe(11);
    expect(istHour(at('2025-10-06T18:30:00Z'))).toBe(0);
    expect(istHour(at('2025-10-06T18:29:00Z'))).toBe(23);
  });
});

describe('greetingFor (India time)', () => {
  it.each([
    ['2025-10-06T23:29:00Z', 'Good evening'], // 04:59 IST
    ['2025-10-06T23:30:00Z', 'Good morning'], // 05:00 IST
    ['2025-10-07T06:29:00Z', 'Good morning'], // 11:59 IST
    ['2025-10-07T06:30:00Z', 'Good afternoon'], // 12:00 IST
    ['2025-10-07T11:29:00Z', 'Good afternoon'], // 16:59 IST
    ['2025-10-07T11:30:00Z', 'Good evening'], // 17:00 IST
    ['2025-10-07T18:29:00Z', 'Good evening'], // 23:59 IST
    ['2025-10-07T18:30:00Z', 'Good evening'], // 00:00 IST
  ])('at %s says %s', (iso, expected) => {
    expect(greetingFor(at(iso))).toBe(expected);
  });
});

describe('formatDashboardDate (India time)', () => {
  it('shows the weekday, day and month', () => {
    expect(formatDashboardDate(at('2025-10-07T06:00:00Z'))).toBe('Tuesday, 7 October');
  });

  it('uses the India date even when the UTC date is still the day before', () => {
    // 23:30 UTC on 6 October is already 05:00 on 7 October in India.
    expect(formatDashboardDate(at('2025-10-06T23:30:00Z'))).toBe('Tuesday, 7 October');
  });

  it('keeps the UTC day until 18:30 UTC, when India passes midnight', () => {
    expect(formatDashboardDate(at('2025-10-06T18:29:00Z'))).toBe('Monday, 6 October');
    expect(formatDashboardDate(at('2025-10-06T18:30:00Z'))).toBe('Tuesday, 7 October');
  });

  it('handles the end of a month and a leap day', () => {
    expect(formatDashboardDate(at('2025-12-31T20:00:00Z'))).toBe('Thursday, 1 January');
    expect(formatDashboardDate(at('2028-02-29T06:00:00Z'))).toBe('Tuesday, 29 February');
  });
});
