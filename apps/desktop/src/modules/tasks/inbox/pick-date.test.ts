import { describe, expect, it } from 'vitest';
import { checkPickedDate } from './pick-date';

// 3:00 PM on Tuesday 7 October 2025 in India
const NOW = Date.parse('2025-10-07T09:30:00.000Z');

describe('checkPickedDate', () => {
  it('accepts today and later days, as the start of that India day', () => {
    expect(checkPickedDate('2025-10-07', NOW)).toEqual({ dueAt: '2025-10-06T18:30:00.000Z' });
    expect(checkPickedDate('2025-10-20', NOW)).toEqual({ dueAt: '2025-10-19T18:30:00.000Z' });
  });

  it('refuses a day before today', () => {
    expect(checkPickedDate('2025-10-06', NOW)).toEqual({ error: 'Pick today or a later date.' });
  });

  it('is still the same India day just after midnight there', () => {
    // 00:10 IST on 8 October is 18:40 UTC on 7 October
    const justAfterMidnight = Date.parse('2025-10-07T18:40:00.000Z');
    expect(checkPickedDate('2025-10-07', justAfterMidnight)).toEqual({
      error: 'Pick today or a later date.',
    });
    expect(checkPickedDate('2025-10-08', justAfterMidnight)).toEqual({
      dueAt: '2025-10-07T18:30:00.000Z',
    });
  });

  it('asks for a date when the box is empty or incomplete', () => {
    expect(checkPickedDate('', NOW)).toEqual({ error: 'Pick a date.' });
    expect(checkPickedDate('2025-10', NOW)).toEqual({ error: 'Pick a date.' });
  });
});
