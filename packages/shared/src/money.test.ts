import { describe, expect, it } from 'vitest';
import { formatInr, percentOf } from './money';

// Intl uses a non-breaking space in some locales; normalize for comparison.
const clean = (value: string) => value.replace(/\u00a0/g, ' ');

describe('formatInr', () => {
  it.each([
    [0, '₹0'],
    [100, '₹1'],
    [1245000, '₹12,450'],
    [2000000, '₹20,000'],
    [12345678900, '₹12,34,56,789'],
    [12345, '₹123.45'],
    [5, '₹0.05'],
    [-45000, '-₹450'],
  ])('formats %s paise as %s', (paise, expected) => {
    expect(clean(formatInr(paise))).toBe(expected);
  });

  it('rejects fractional paise and non-numbers', () => {
    expect(() => formatInr(10.5)).toThrow(RangeError);
    expect(() => formatInr(Number.NaN)).toThrow(RangeError);
    expect(() => formatInr(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('percentOf', () => {
  it('rounds to a whole percent', () => {
    expect(percentOf(1245000, 2000000)).toBe(62);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
  });

  it('can go over 100 and is 0 for an empty whole', () => {
    expect(percentOf(30, 20)).toBe(150);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(0, 100)).toBe(0);
  });
});
