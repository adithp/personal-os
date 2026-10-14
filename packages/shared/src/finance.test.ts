import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsToMonth,
  isDayString,
  monthEnd,
  monthOf,
  monthStart,
  nextRuleDay,
  transactionShapeError,
} from './finance';
import { monthlyPaise, yearlyPaise } from './subscriptions';

describe('addDays', () => {
  it('moves across month and year ends and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-05-10', 0)).toBe('2026-05-10');
  });
});

describe('addMonths', () => {
  it('keeps the day or clamps to the last day of a short month', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
});

describe('month helpers', () => {
  it('monthOf, monthStart, monthEnd and addMonthsToMonth', () => {
    expect(monthOf('2026-10-14')).toBe('2026-10');
    expect(monthStart('2026-10')).toBe('2026-10-01');
    expect(monthEnd('2026-10')).toBe('2026-11-01');
    expect(monthEnd('2026-12')).toBe('2027-01-01');
    expect(addMonthsToMonth('2026-01', -1)).toBe('2025-12');
  });

  it('isDayString accepts real days only', () => {
    expect(isDayString('2026-02-28')).toBe(true);
    expect(isDayString('2026-02-30')).toBe(false);
    expect(isDayString('2026-2-3')).toBe(false);
  });
});

describe('nextRuleDay', () => {
  it('daily is the next day', () => {
    expect(nextRuleDay('FREQ=DAILY', '2026-02-28')).toBe('2026-03-01');
  });

  it('weekly finds the next chosen weekday strictly after', () => {
    // 2026-10-14 is a Wednesday
    expect(nextRuleDay('FREQ=WEEKLY;BYDAY=MO,FR', '2026-10-14')).toBe('2026-10-16');
    expect(nextRuleDay('FREQ=WEEKLY;BYDAY=MO,FR', '2026-10-16')).toBe('2026-10-19');
    expect(nextRuleDay('FREQ=WEEKLY;BYDAY=WE', '2026-10-14')).toBe('2026-10-21');
  });

  it('monthly on day 31 uses the last day of short months and is strictly after', () => {
    expect(nextRuleDay('FREQ=MONTHLY;BYMONTHDAY=31', '2026-01-31')).toBe('2026-02-28');
    expect(nextRuleDay('FREQ=MONTHLY;BYMONTHDAY=31', '2026-02-28')).toBe('2026-03-31');
    expect(nextRuleDay('FREQ=MONTHLY;BYMONTHDAY=31', '2026-03-31')).toBe('2026-04-30');
    expect(nextRuleDay('FREQ=MONTHLY;BYMONTHDAY=31', '2024-01-31')).toBe('2024-02-29');
    expect(nextRuleDay('FREQ=MONTHLY;BYMONTHDAY=1', '2026-12-15')).toBe('2027-01-01');
    expect(nextRuleDay('FREQ=MONTHLY;BYMONTHDAY=15', '2026-03-10')).toBe('2026-03-15');
  });

  it('yearly keeps month and day, and 29 February becomes 28 February', () => {
    expect(nextRuleDay('FREQ=YEARLY', '2026-10-14')).toBe('2027-10-14');
    expect(nextRuleDay('FREQ=YEARLY', '2024-02-29')).toBe('2025-02-28');
  });

  it('is null for rules that are not presets', () => {
    expect(nextRuleDay('FREQ=HOURLY', '2026-10-14')).toBeNull();
  });
});

describe('subscription costs', () => {
  it('yearlyPaise and monthlyPaise per cycle', () => {
    expect(yearlyPaise(100, 'weekly')).toBe(5200);
    expect(yearlyPaise(100, 'monthly')).toBe(1200);
    expect(yearlyPaise(100, 'quarterly')).toBe(400);
    expect(yearlyPaise(100, 'yearly')).toBe(100);
    expect(monthlyPaise(1200, 'yearly')).toBe(100);
    expect(monthlyPaise(100, 'weekly')).toBe(433);
    expect(monthlyPaise(100, 'quarterly')).toBe(33);
    expect(monthlyPaise(64900, 'monthly')).toBe(64900);
  });
});

describe('transactionShapeError', () => {
  it('checks transfers and second wallets', () => {
    expect(transactionShapeError({ kind: 'transfer', walletId: 'a', toWalletId: 'b' })).toBeNull();
    expect(transactionShapeError({ kind: 'transfer', walletId: 'a' })).not.toBeNull();
    expect(transactionShapeError({ kind: 'transfer', walletId: 'a', toWalletId: 'a' })).not.toBeNull();
    expect(transactionShapeError({ kind: 'expense', walletId: 'a', toWalletId: 'b' })).not.toBeNull();
    expect(transactionShapeError({ kind: 'expense', walletId: 'a' })).toBeNull();
  });
});
