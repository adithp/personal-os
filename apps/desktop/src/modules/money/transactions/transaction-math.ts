import { formatInr, type Transaction } from '@personal-os/shared';

/** "+₹500", "-₹120" or "₹300" (transfers have no sign). */
export function signedAmount(kind: Transaction['kind'], paise: number): string {
  if (kind === 'income') return `+${formatInr(paise)}`;
  if (kind === 'expense') return `-${formatInr(paise)}`;
  return formatInr(paise);
}

/** Net of a day: income minus expense (transfers move money between wallets, so they are left out). */
export function dayNet(items: readonly Transaction[]): number {
  return items.reduce(
    (sum, item) =>
      item.kind === 'income'
        ? sum + item.amountPaise
        : item.kind === 'expense'
          ? sum - item.amountPaise
          : sum,
    0,
  );
}

/** Groups transactions by India day, newest day first (the order inside a day is kept). */
export function groupByDay(items: readonly Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const item of items) {
    const list = groups.get(item.occurredOn) ?? [];
    list.push(item);
    groups.set(item.occurredOn, list);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}
