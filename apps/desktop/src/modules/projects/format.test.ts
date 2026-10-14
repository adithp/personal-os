import { describe, expect, it } from 'vitest';
import {
  accentOf,
  formatClock,
  formatDay,
  formatDayShort,
  formatTimer,
  isOverdue,
  progressText,
} from './format';

// 3 PM on Tuesday 7 October 2025 in India
const NOW = Date.parse('2025-10-07T09:30:00.000Z');

describe('dates in India time', () => {
  it('shows the India day of a UTC time', () => {
    // 18:30 UTC is already the next day in India
    expect(formatDay('2025-12-30T18:30:00.000Z')).toBe('31 Dec 2025');
    expect(formatDayShort('2025-12-30T18:30:00.000Z')).toBe('31 Dec');
    expect(formatClock('2025-10-07T09:30:00.000Z')).toBe('3:00 pm');
  });
});

describe('isOverdue', () => {
  it('is true only for a going project whose due day is before today', () => {
    const yesterday = '2025-10-05T18:30:00.000Z';
    const today = '2025-10-06T18:30:00.000Z';
    expect(isOverdue({ dueAt: yesterday, status: 'active' }, NOW)).toBe(true);
    expect(isOverdue({ dueAt: yesterday, status: 'on_hold' }, NOW)).toBe(true);
    expect(isOverdue({ dueAt: yesterday, status: 'done' }, NOW)).toBe(false);
    expect(isOverdue({ dueAt: yesterday, status: 'archived' }, NOW)).toBe(false);
    expect(isOverdue({ dueAt: today, status: 'active' }, NOW)).toBe(false);
    expect(isOverdue({ dueAt: null, status: 'active' }, NOW)).toBe(false);
  });
});

describe('small helpers', () => {
  it('formats a running timer', () => {
    expect(formatTimer(-5)).toBe('00:00:00');
    expect(formatTimer(59)).toBe('00:00:59');
    expect(formatTimer(36_000 + 61)).toBe('10:01:01');
  });

  it('words the task progress', () => {
    expect(progressText({ done: 0, total: 0 })).toBe('No tasks yet');
    expect(progressText({ done: 3, total: 8 })).toBe('3 of 8 tasks');
  });

  it('uses the Projects color for a project without its own', () => {
    expect(accentOf(null)).toBe('var(--module-projects)');
    expect(accentOf('#F7D96B')).toBe('#F7D96B');
  });
});
