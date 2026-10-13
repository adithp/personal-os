import { describe, expect, it } from 'vitest';
import { closedLine, progressText, targetLine } from './goal-format';

// 3:00 PM on Tuesday 7 October 2025 in India
const NOW = new Date('2025-10-07T09:30:00.000Z');

describe('targetLine', () => {
  it('says there is no target date', () => {
    expect(targetLine({ targetAt: null, status: 'active' }, NOW)).toEqual({
      text: 'No target date',
      passed: false,
    });
  });

  it('shows the day without the year in this year', () => {
    // 31 December, start of the India day
    expect(targetLine({ targetAt: '2025-12-30T18:30:00.000Z', status: 'active' }, NOW).text).toBe(
      'By 31 Dec',
    );
  });

  it('adds the year when the target is not this year', () => {
    expect(targetLine({ targetAt: '2026-12-30T18:30:00.000Z', status: 'active' }, NOW).text).toBe(
      'By 31 Dec 2026',
    );
  });

  it('is not passed on the target day itself, and passed the day after', () => {
    expect(targetLine({ targetAt: '2025-10-06T18:30:00.000Z', status: 'active' }, NOW).passed).toBe(
      false,
    );
    const late = targetLine({ targetAt: '2025-09-01T18:30:00.000Z', status: 'active' }, NOW);
    expect(late).toEqual({ text: 'Target passed · 2 Sept', passed: true });
  });

  it('does not call a closed goal passed', () => {
    expect(
      targetLine({ targetAt: '2025-09-01T18:30:00.000Z', status: 'achieved' }, NOW).passed,
    ).toBe(false);
  });
});

describe('closedLine and progressText', () => {
  it('names the status and the India day it was closed', () => {
    // 00:10 IST on 13 Oct is still 12 Oct in UTC
    const closedAt = '2025-10-12T18:40:00.000Z';
    expect(closedLine({ status: 'achieved', closedAt }, NOW)).toBe('Achieved 13 Oct');
    expect(closedLine({ status: 'dropped', closedAt }, NOW)).toBe('Dropped 13 Oct');
  });

  it('writes the progress count', () => {
    expect(progressText({ done: 3, total: 8 })).toBe('3 of 8 tasks');
    expect(progressText({ done: 1, total: 1 })).toBe('1 of 1 task');
  });
});
