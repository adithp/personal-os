const inr0 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

/**
 * Formats an amount stored as integer paise, e.g. 1245000 → "₹12,450" and 12345 → "₹123.45".
 * Whole rupees show no decimals. Money is never stored as a float.
 */
export function formatInr(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError('Money must be whole paise');
  const wholeRupees = paise % 100 === 0;
  return (wholeRupees ? inr0 : inr2).format(paise / 100);
}

/** Whole percent of `part` in `whole` (rounded), 0 when `whole` is 0. Uses integer paise. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part * 100) / whole);
}
