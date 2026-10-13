import { describe, expect, it } from 'vitest';
import { makeReport } from '../../../test/fake-api';
import {
  axisLabel,
  comparisonName,
  dayLabel,
  daySummary,
  dayTooltip,
  isFutureDay,
  onTimePercent,
  ordinal,
  periodLabel,
  weekdayShort,
} from './report-format';

describe('report dates', () => {
  it('reads weekdays from the date text, not from the machine zone', () => {
    expect(weekdayShort('2026-10-16')).toBe('Fri');
    expect(weekdayShort('2026-10-12')).toBe('Mon');
    expect(weekdayShort('2024-02-29')).toBe('Thu');
    expect(dayLabel('2026-10-16')).toBe('Fri 16 Oct');
  });

  it('labels a week and a month', () => {
    expect(periodLabel({ period: 'week', start: '2026-10-12', end: '2026-10-18' })).toBe(
      'Mon 12 – Sun 18 Oct',
    );
    expect(periodLabel({ period: 'week', start: '2026-09-28', end: '2026-10-04' })).toBe(
      'Mon 28 Sep – Sun 4 Oct',
    );
    expect(periodLabel({ period: 'month', start: '2026-10-01', end: '2026-10-31' })).toBe(
      'October 2026',
    );
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 16, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '16th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ]);
  });

  it('names the comparison for a week and a month', () => {
    const previous = {
      start: '2026-10-05',
      end: '2026-10-09',
      done: 0,
      onTime: 0,
      late: 0,
      noDueDate: 0,
      added: 0,
    };
    expect(comparisonName({ period: 'week', previous })).toBe('Last week by Fri');
    expect(
      comparisonName({
        period: 'month',
        previous: { ...previous, start: '2026-09-01', end: '2026-09-16' },
      }),
    ).toBe('Last month by the 16th');
  });

  it('compares dates as text', () => {
    expect(isFutureDay('2026-10-17', '2026-10-16')).toBe(true);
    expect(isFutureDay('2026-10-16', '2026-10-16')).toBe(false);
  });
});

describe('onTimePercent', () => {
  it('rounds half up and is null without due dates', () => {
    expect(onTimePercent(8, 2)).toBe(80);
    expect(onTimePercent(1, 2)).toBe(33);
    expect(onTimePercent(2, 1)).toBe(67);
    expect(onTimePercent(1, 7)).toBe(13); // 12.5 rounds up
    expect(onTimePercent(3, 0)).toBe(100);
    expect(onTimePercent(0, 4)).toBe(0);
    expect(onTimePercent(0, 0)).toBeNull();
  });
});

describe('axis labels', () => {
  it('shows Mon to Sun for a week', () => {
    expect(axisLabel('2026-10-14', 'week')).toBe('Wed');
  });

  it('shows the 1st and every Monday for a month', () => {
    expect(axisLabel('2026-10-01', 'month')).toBe('1');
    expect(axisLabel('2026-10-05', 'month')).toBe('5');
    expect(axisLabel('2026-10-12', 'month')).toBe('12');
    expect(axisLabel('2026-10-06', 'month')).toBe('');
  });
});

describe('summaries', () => {
  const week = (counts: number[]) =>
    makeReport('week', {
      days: counts.map((done, index) => ({
        date: `2026-10-${String(12 + index)}`,
        done,
        onTime: done,
        late: 0,
        noDueDate: 0,
      })),
      totals: {
        done: counts.reduce((a, b) => a + b, 0),
        onTime: 0,
        late: 0,
        noDueDate: 0,
        added: 0,
      },
    });

  it('names the busiest day of a week', () => {
    expect(daySummary(week([3, 5, 2, 6, 4, 1, 0]))).toBe(
      'Done per day this week: 21 tasks, most on Thursday (6).',
    );
  });

  it('uses the singular and handles an empty period', () => {
    expect(daySummary(week([0, 0, 1, 0, 0, 0, 0]))).toBe(
      'Done per day this week: 1 task, most on Wednesday (1).',
    );
    expect(daySummary(week([0, 0, 0, 0, 0, 0, 0]))).toBe('Done per day this week: no tasks done.');
  });

  it('names a date for a month', () => {
    const report = makeReport('month', {
      days: [
        { date: '2026-10-01', done: 1, onTime: 1, late: 0, noDueDate: 0 },
        { date: '2026-10-02', done: 4, onTime: 4, late: 0, noDueDate: 0 },
      ],
      totals: { done: 5, onTime: 5, late: 0, noDueDate: 0, added: 0 },
    });
    expect(daySummary(report)).toBe('Done per day this month: 5 tasks, most on 2 Oct (4).');
  });

  it('writes the tooltip lines', () => {
    expect(dayTooltip({ date: '2026-10-16', done: 4, onTime: 3, late: 1, noDueDate: 0 })).toEqual({
      title: 'Fri 16 Oct · 4 done',
      detail: '3 on time · 1 late',
    });
    expect(
      dayTooltip({ date: '2026-10-16', done: 5, onTime: 3, late: 1, noDueDate: 1 }).detail,
    ).toBe('3 on time · 1 late · 1 no date');
  });
});
