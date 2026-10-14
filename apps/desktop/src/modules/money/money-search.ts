import { monthSchema } from '@personal-os/shared';

export const MONEY_SECTIONS = [
  'overview',
  'transactions',
  'wallets',
  'budgets',
  'goals',
  'subscriptions',
  'reports',
] as const;
export type MoneySection = (typeof MONEY_SECTIONS)[number];

/** Sections that show one month and answer to [ and ]. */
export const MONTH_SECTIONS: readonly MoneySection[] = ['transactions', 'budgets', 'reports'];

/** The URL search params of /money. */
export interface MoneySearch {
  /** The page shown. Left out for Overview. */
  section?: MoneySection;
  /** YYYY-MM for Transactions, Budgets and Reports. Left out for this month (India). */
  month?: string;
  /** Transactions of one wallet (opened from the Wallets page). */
  wallet?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keeps only valid params, so a bad or old link opens Overview instead of failing. */
export function validateMoneySearch(raw: Record<string, unknown>): MoneySearch {
  const search: MoneySearch = {};
  const section = MONEY_SECTIONS.find((item) => item === raw.section);
  if (section && section !== 'overview') search.section = section;
  if (typeof raw.month === 'string' && monthSchema.safeParse(raw.month).success) {
    search.month = raw.month;
  }
  if (typeof raw.wallet === 'string' && UUID.test(raw.wallet)) search.wallet = raw.wallet;
  return search;
}
