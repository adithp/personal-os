import { describe, expect, it } from 'vitest';
import {
  changeText,
  dayHeading,
  monthLabel,
  parseRupees,
  renewalText,
  rupeesText,
  shortDay,
} from './money-format';
import { validateMoneySearch } from './money-search';

describe('parseRupees', () => {
  it('turns typed rupees into integer paise', () => {
    expect(parseRupees('1,234.50')).toBe(123450);
    expect(parseRupees('500')).toBe(50000);
    expect(parseRupees('0.05')).toBe(5);
    expect(parseRupees('12.5')).toBe(1250);
    expect(parseRupees('₹ 99')).toBe(9900);
    expect(parseRupees('0')).toBe(0);
  });

  it('never goes through a float (19.99 and 1.15 stay exact)', () => {
    expect(parseRupees('19.99')).toBe(1999);
    expect(parseRupees('1.15')).toBe(115);
    expect(parseRupees('0.29')).toBe(29);
    expect(Number.isInteger(parseRupees('4.35'))).toBe(true);
  });

  it('rejects more than two decimals, letters, empty text and a second dot', () => {
    expect(parseRupees('1.234')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('1.2.3')).toBeNull();
    expect(parseRupees('1e5')).toBeNull();
    expect(parseRupees('.')).toBeNull();
  });

  it('rejects an amount above the limit', () => {
    expect(parseRupees('10000000001')).toBeNull();
    expect(parseRupees('10000000000')).toBe(1_000_000_000_000);
  });

  it('accepts a minus only when asked', () => {
    expect(parseRupees('-50')).toBeNull();
    expect(parseRupees('-50.25', { allowNegative: true })).toBe(-5025);
  });
});

describe('rupeesText', () => {
  it('writes whole rupees without decimals and keeps two otherwise', () => {
    expect(rupeesText(123450)).toBe('1234.50');
    expect(rupeesText(120000)).toBe('1200');
    expect(rupeesText(5)).toBe('0.05');
    expect(rupeesText(-5025)).toBe('-50.25');
  });

  it('round-trips with parseRupees', () => {
    for (const paise of [1, 99, 100, 123456, 999999999]) {
      expect(parseRupees(rupeesText(paise))).toBe(paise);
    }
  });
});

describe('dates and words', () => {
  it('names today and yesterday, else the weekday and date', () => {
    expect(dayHeading('2026-10-14', '2026-10-14')).toBe('Today');
    expect(dayHeading('2026-10-13', '2026-10-14')).toBe('Yesterday');
    expect(dayHeading('2026-10-01', '2026-10-14')).toMatch(/Thu/);
    expect(shortDay('2026-10-01')).toMatch(/1 Oct/);
    expect(monthLabel('2026-10')).toBe('October 2026');
  });

  it('compares with the last month', () => {
    expect(changeText(150, 100)).toBe('+50% vs last month');
    expect(changeText(50, 100)).toBe('-50% vs last month');
    expect(changeText(100, 100)).toBe('Same as last month');
    expect(changeText(100, 0)).toBeNull();
  });

  it('says when a renewal is due', () => {
    expect(renewalText(-4)).toBe('Overdue by 4 days');
    expect(renewalText(-1)).toBe('Overdue by 1 day');
    expect(renewalText(0)).toBe('Today');
    expect(renewalText(1)).toBe('Tomorrow');
    expect(renewalText(6)).toBe('In 6 days');
  });
});

describe('validateMoneySearch', () => {
  it('keeps a valid section, month and wallet', () => {
    const wallet = '10000000-0000-4000-8000-000000000001';
    expect(validateMoneySearch({ section: 'budgets', month: '2026-09', wallet })).toEqual({
      section: 'budgets',
      month: '2026-09',
      wallet,
    });
  });

  it('drops anything else, and leaves Overview as no section', () => {
    expect(validateMoneySearch({ section: 'overview' })).toEqual({});
    expect(validateMoneySearch({ section: 'nope', month: '2026-13', wallet: 'x' })).toEqual({});
    expect(validateMoneySearch({ section: 3, month: 202610 })).toEqual({});
  });
});
