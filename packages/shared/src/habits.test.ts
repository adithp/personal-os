import { describe, expect, it } from 'vitest';
import {
  buildHabitStats,
  computeStreaks,
  createHabitInput,
  indiaDateOf,
  isScheduledOn,
  isoWeekdayOfDay,
  dayNumberOf,
  rangeBounds,
  updateHabitInput,
  type HabitSchedule,
} from './habits';

const daily: HabitSchedule = { type: 'daily' };

/** Counts for the listed dates, each at the given count. */
const logs = (dates: string[], count = 1) => new Map(dates.map((date) => [date, count]));

describe('India days', () => {
  it('uses the India calendar day, not the UTC day', () => {
    expect(indiaDateOf(new Date('2026-10-13T18:29:59Z'))).toBe('2026-10-13');
    expect(indiaDateOf(new Date('2026-10-13T18:30:00Z'))).toBe('2026-10-14');
  });

  it('knows the ISO weekday', () => {
    // 2026-10-14 is a Wednesday
    expect(isoWeekdayOfDay(dayNumberOf('2026-10-14'))).toBe(3);
    expect(isoWeekdayOfDay(dayNumberOf('2026-10-18'))).toBe(7);
    expect(isoWeekdayOfDay(dayNumberOf('2026-10-12'))).toBe(1);
  });
});

describe('isScheduledOn', () => {
  it('daily is every day from the start date', () => {
    expect(isScheduledOn(daily, '2026-10-10', '2026-10-10')).toBe(true);
    expect(isScheduledOn(daily, '2026-10-10', '2026-10-09')).toBe(false);
  });

  it('weekly uses the chosen weekdays', () => {
    const mwf: HabitSchedule = { type: 'weekly', days: [1, 3, 5] };
    expect(isScheduledOn(mwf, '2026-10-01', '2026-10-12')).toBe(true); // Mon
    expect(isScheduledOn(mwf, '2026-10-01', '2026-10-13')).toBe(false); // Tue
    expect(isScheduledOn(mwf, '2026-10-01', '2026-10-14')).toBe(true); // Wed
  });

  it('custom counts every N days from the start date', () => {
    const every3: HabitSchedule = { type: 'custom', everyDays: 3 };
    expect(isScheduledOn(every3, '2026-10-01', '2026-10-04')).toBe(true);
    expect(isScheduledOn(every3, '2026-10-01', '2026-10-05')).toBe(false);
    expect(isScheduledOn(every3, '2026-10-01', '2026-10-07')).toBe(true);
  });
});

describe('computeStreaks', () => {
  const base = { schedule: daily, startDate: '2026-10-01', target: 1 };

  it('counts consecutive done days up to today', () => {
    const result = computeStreaks({
      ...base,
      counts: logs(['2026-10-12', '2026-10-13', '2026-10-14']),
      today: '2026-10-14',
    });
    expect(result).toEqual({ current: 3, best: 3, atRisk: false });
  });

  it('keeps the streak while today is still open and marks it at risk', () => {
    const result = computeStreaks({
      ...base,
      counts: logs(['2026-10-12', '2026-10-13']),
      today: '2026-10-14',
    });
    expect(result).toEqual({ current: 2, best: 2, atRisk: true });
  });

  it('breaks on a missed day before today and keeps the best', () => {
    const result = computeStreaks({
      ...base,
      counts: logs(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-07']),
      today: '2026-10-07',
    });
    expect(result.current).toBe(2);
    expect(result.best).toBe(3);
  });

  it('is zero with no logs and not at risk', () => {
    expect(computeStreaks({ ...base, counts: new Map(), today: '2026-10-14' })).toEqual({
      current: 0,
      best: 0,
      atRisk: false,
    });
  });

  it('skips days that are not scheduled', () => {
    // Mon/Wed/Fri: Mon 12 and Wed 14 done, Tue 13 is not scheduled and does not break
    const result = computeStreaks({
      schedule: { type: 'weekly', days: [1, 3, 5] },
      startDate: '2026-10-05',
      target: 1,
      counts: logs(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14']),
      today: '2026-10-14',
    });
    expect(result).toEqual({ current: 5, best: 5, atRisk: false });
  });

  it('a missed scheduled day breaks a weekly streak', () => {
    const result = computeStreaks({
      schedule: { type: 'weekly', days: [1, 3, 5] },
      startDate: '2026-10-05',
      target: 1,
      counts: logs(['2026-10-05', '2026-10-09', '2026-10-12', '2026-10-14']),
      today: '2026-10-14',
    });
    // Wed 7 was missed
    expect(result.current).toBe(3);
    expect(result.best).toBe(3);
  });

  it('a non-scheduled today does not break or risk the streak', () => {
    const result = computeStreaks({
      schedule: { type: 'weekly', days: [1] },
      startDate: '2026-10-05',
      target: 1,
      counts: logs(['2026-10-05', '2026-10-12']),
      today: '2026-10-14',
    });
    expect(result).toEqual({ current: 2, best: 2, atRisk: false });
  });

  it('needs the target count for a counter habit', () => {
    const result = computeStreaks({
      ...base,
      target: 3,
      counts: new Map([
        ['2026-10-13', 3],
        ['2026-10-14', 2],
      ]),
      today: '2026-10-14',
    });
    expect(result).toEqual({ current: 1, best: 1, atRisk: true });
  });

  it('works for a custom every-N-days schedule', () => {
    const result = computeStreaks({
      schedule: { type: 'custom', everyDays: 2 },
      startDate: '2026-10-08',
      target: 1,
      counts: logs(['2026-10-08', '2026-10-10', '2026-10-12', '2026-10-14']),
      today: '2026-10-14',
    });
    expect(result).toEqual({ current: 4, best: 4, atRisk: false });
  });

  it('accepts a plain object of counts', () => {
    const result = computeStreaks({
      ...base,
      counts: { '2026-10-14': 1 },
      today: '2026-10-14',
    });
    expect(result.current).toBe(1);
  });
});

describe('rangeBounds', () => {
  it('week is Monday to Sunday', () => {
    expect(rangeBounds('week', '2026-10-14')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(rangeBounds('week', '2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('month and year', () => {
    expect(rangeBounds('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(rangeBounds('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(rangeBounds('year', '2026-10-14')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('buildHabitStats', () => {
  it('counts scheduled and done days up to today, marks the future', () => {
    const stats = buildHabitStats({
      schedule: daily,
      startDate: '2026-10-01',
      target: 1,
      counts: logs(['2026-10-12', '2026-10-13']),
      today: '2026-10-14',
      range: 'week',
      anchor: '2026-10-14',
    });
    expect(stats.from).toBe('2026-10-12');
    expect(stats.days).toHaveLength(7);
    expect(stats.days.filter((day) => day.future)).toHaveLength(4);
    expect(stats.scheduledCount).toBe(3);
    expect(stats.doneCount).toBe(2);
    expect(stats.rate).toBeCloseTo(2 / 3);
    expect(stats.totalDone).toBe(2);
    expect(stats.currentStreak).toBe(2);
  });

  it('does not count days before the start date', () => {
    const stats = buildHabitStats({
      schedule: daily,
      startDate: '2026-10-13',
      target: 1,
      counts: new Map(),
      today: '2026-10-14',
      range: 'month',
      anchor: '2026-10-14',
    });
    expect(stats.scheduledCount).toBe(2);
    expect(stats.doneCount).toBe(0);
    expect(stats.rate).toBe(0);
  });

  it('has rate 0 when nothing was scheduled', () => {
    const stats = buildHabitStats({
      schedule: daily,
      startDate: '2026-12-01',
      target: 1,
      counts: new Map(),
      today: '2026-10-14',
      range: 'month',
      anchor: '2026-10-14',
    });
    expect(stats.scheduledCount).toBe(0);
    expect(stats.rate).toBe(0);
  });
});

describe('input schemas', () => {
  it('create defaults to a daily habit with target 1', () => {
    const parsed = createHabitInput.parse({ name: '  Read  ' });
    expect(parsed.name).toBe('Read');
    expect(parsed.schedule).toEqual({ type: 'daily' });
    expect(parsed.target).toBe(1);
  });

  it('weekly days are sorted and unique, and at least one is needed', () => {
    const parsed = createHabitInput.parse({
      name: 'Gym',
      schedule: { type: 'weekly', days: [5, 1, 5] },
    });
    expect(parsed.schedule).toEqual({ type: 'weekly', days: [1, 5] });
    expect(() =>
      createHabitInput.parse({ name: 'Gym', schedule: { type: 'weekly', days: [] } }),
    ).toThrow();
  });

  it('rejects bad values', () => {
    expect(() => createHabitInput.parse({ name: ' ' })).toThrow();
    expect(() => createHabitInput.parse({ name: 'x', target: 0 })).toThrow();
    expect(() => createHabitInput.parse({ name: 'x', reminderTime: '25:00' })).toThrow();
    expect(() => createHabitInput.parse({ name: 'x', color: 'red' })).toThrow();
    expect(() => createHabitInput.parse({ name: 'x', startDate: '2026-02-30' })).toThrow();
    expect(() => createHabitInput.parse({ name: 'x', startDate: '2026-13-45' })).toThrow();
    expect(() => createHabitInput.parse({ name: 'x', startDate: '2026-00-10' })).toThrow();
    expect(() =>
      createHabitInput.parse({ name: 'x', schedule: { type: 'custom', everyDays: 1 } }),
    ).toThrow();
  });

  it('update needs something to change', () => {
    const id = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';
    expect(() => updateHabitInput.parse({ id })).toThrow();
    expect(updateHabitInput.parse({ id, category: null }).category).toBeNull();
  });
});
