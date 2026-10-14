import type { Habit, HabitDay } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { makeHabit } from '../../test/fake-habits';
import {
  barsOf,
  categoriesOf,
  cellLabel,
  cellState,
  dayText,
  habitColor,
  leadingBlanks,
  monthText,
  nextMonth,
  percentText,
  previousMonth,
  progressLabel,
  scheduleLabel,
  splitToday,
} from './format';

const view = (overrides: Partial<Habit> & { done?: boolean; scheduled?: boolean } = {}): Habit => {
  const { done = false, scheduled = true, ...rest } = overrides;
  return {
    ...makeHabit(),
    today: { date: '2025-10-07', scheduled, count: done ? 1 : 0, done },
    currentStreak: 0,
    bestStreak: 0,
    atRisk: false,
    ...rest,
  };
};

const day = (date: string, extra: Partial<HabitDay> = {}): HabitDay => ({
  date,
  scheduled: true,
  count: 0,
  done: false,
  future: false,
  ...extra,
});

describe('labels', () => {
  it('describes the schedule', () => {
    expect(scheduleLabel({ type: 'daily' })).toBe('Every day');
    expect(scheduleLabel({ type: 'weekly', days: [1, 3, 5] })).toBe('Mon, Wed, Fri');
    expect(scheduleLabel({ type: 'custom', everyDays: 3 })).toBe('Every 3 days');
  });

  it('shows count / target only for a counter', () => {
    expect(progressLabel(view())).toBe('');
    const counter = view({ target: 8 });
    counter.today.count = 3;
    expect(progressLabel(counter)).toBe('3 / 8');
  });

  it('uses the habit color, else the module color', () => {
    expect(habitColor({ color: '#F4A9C4' })).toBe('#F4A9C4');
    expect(habitColor({ color: null })).toBe('var(--module-habits)');
  });

  it('formats days, months and percents on the plain calendar', () => {
    expect(dayText('2025-10-07')).toContain('7');
    expect(monthText('2025-10-07')).toBe('October 2025');
    expect(percentText(0.8333)).toBe('83%');
  });
});

describe('splitToday', () => {
  it('puts undone habits first, then done, and the rest in Not today', () => {
    const a = view({ name: 'a', done: true });
    const b = view({ name: 'b' });
    const c = view({ name: 'c', scheduled: false });
    const { today, notToday } = splitToday([a, b, c]);
    expect(today.map((h) => h.name)).toEqual(['b', 'a']);
    expect(notToday.map((h) => h.name)).toEqual(['c']);
  });
});

describe('categoriesOf', () => {
  it('lists each category once, sorted', () => {
    expect(
      categoriesOf([
        view({ category: 'Health' }),
        view({ category: 'Art' }),
        view({ category: 'Health' }),
        view(),
      ]),
    ).toEqual(['Art', 'Health']);
  });
});

describe('calendar', () => {
  it('classifies days', () => {
    const today = '2025-10-07';
    expect(cellState(day('2025-10-08', { future: true }), today)).toBe('future');
    expect(cellState(day('2025-10-05', { done: true }), today)).toBe('done');
    expect(cellState(day('2025-10-05', { scheduled: false }), today)).toBe('off');
    expect(cellState(day('2025-10-05'), today)).toBe('missed');
    expect(cellState(day('2025-10-07'), today)).toBe('open');
    expect(cellLabel(day('2025-10-05'), 'missed')).toMatch(/missed$/);
  });

  it('starts the grid on a Monday and moves between months', () => {
    expect(leadingBlanks('2025-10-01')).toBe(2); // a Wednesday
    expect(previousMonth('2025-10-01')).toBe('2025-09-01');
    expect(nextMonth('2025-10-01')).toBe('2025-11-01');
    expect(previousMonth('2025-01-01')).toBe('2024-12-01');
  });
});

describe('barsOf', () => {
  const days = [
    day('2025-10-06', { count: 1, done: true }),
    day('2025-10-07'),
    day('2025-11-01', { count: 1, done: true }),
  ];

  it('labels a week with weekday names and a month with day numbers', () => {
    expect(barsOf(days, 'week').map((bar) => bar.label)).toEqual(['Mon', 'Tue', 'Sat']);
    expect(barsOf(days, 'month').map((bar) => bar.label)).toEqual(['6', '7', '1']);
    expect(barsOf(days, 'month').map((bar) => bar.value)).toEqual([1, 0, 1]);
  });

  it('sums the days done per month for a year', () => {
    const bars = barsOf(days, 'year');
    expect(bars.map((bar) => [bar.label, bar.value])).toEqual([
      ['Oct', 1],
      ['Nov', 1],
    ]);
  });
});
