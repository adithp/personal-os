import type { ListTransactionsInput, SubscriptionStatus } from '@personal-os/shared';

/** Every cached Money query (all seven screens) starts with this key. */
export const MONEY_KEY = ['money'] as const;

export const moneyKeys = {
  all: MONEY_KEY,
  wallets: (includeArchived = false) => [...MONEY_KEY, 'wallets', { includeArchived }] as const,
  categories: [...MONEY_KEY, 'categories'] as const,
  transactions: [...MONEY_KEY, 'transactions'] as const,
  transactionList: (filters: ListTransactionsInput) =>
    [...MONEY_KEY, 'transactions', 'list', filters] as const,
  recurring: [...MONEY_KEY, 'recurring'] as const,
  budgets: (month: string) => [...MONEY_KEY, 'budgets', month] as const,
  goals: [...MONEY_KEY, 'goals'] as const,
  summary: (month: string) => [...MONEY_KEY, 'summary', month] as const,
  subscriptions: (status?: SubscriptionStatus) =>
    [...MONEY_KEY, 'subscriptions', { status: status ?? null }] as const,
  upcoming: (days: number) => [...MONEY_KEY, 'upcoming', days] as const,
};
