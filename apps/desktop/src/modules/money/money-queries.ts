import type {
  Budget,
  Category,
  ListTransactionsInput,
  MonthSummary,
  RecurringTransaction,
  SavingsGoal,
  Subscription,
  SubscriptionStatus,
  SubscriptionSummary,
  Transaction,
  Wallet,
} from '@personal-os/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApi } from '../../api/api-context';
import { MONEY_KEY, moneyKeys } from './query-keys';

/** The read hooks of the Money page. Each answers `{ items }` (or the object named) of the API. */

export function useWallets(includeArchived = false) {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.wallets(includeArchived),
    queryFn: async () =>
      (
        await api.request<{ items: Wallet[] }>('GET', '/wallets', {
          query: includeArchived ? { includeArchived: true } : undefined,
        })
      ).items,
  });
}

export function useCategories() {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.categories,
    queryFn: async () => (await api.request<{ items: Category[] }>('GET', '/categories')).items,
  });
}

export function useTransactions(filters: ListTransactionsInput) {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.transactionList(filters),
    queryFn: async () =>
      (
        await api.request<{ items: Transaction[] }>('GET', '/transactions', {
          query: { ...filters },
        })
      ).items,
  });
}

export function useRecurring() {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.recurring,
    queryFn: async () =>
      (await api.request<{ items: RecurringTransaction[] }>('GET', '/recurring-transactions'))
        .items,
  });
}

export function useBudgets(month: string) {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.budgets(month),
    queryFn: async () =>
      (await api.request<{ items: Budget[] }>('GET', '/budgets', { query: { month } })).items,
  });
}

export function useGoals() {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.goals,
    queryFn: async () =>
      (await api.request<{ items: SavingsGoal[] }>('GET', '/savings-goals')).items,
  });
}

export function useSummary(month: string) {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.summary(month),
    queryFn: async () =>
      (
        await api.request<{ summary: MonthSummary }>('GET', '/finance/summary', {
          query: { month },
        })
      ).summary,
  });
}

export interface SubscriptionList {
  items: Subscription[];
  summary: SubscriptionSummary;
}

export function useSubscriptions(status?: SubscriptionStatus) {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.subscriptions(status),
    queryFn: () =>
      api.request<SubscriptionList>('GET', '/subscriptions', {
        query: status ? { status } : undefined,
      }),
  });
}

/** Active subscriptions renewing within `days` days, overdue first. */
export function useUpcoming(days = 30) {
  const api = useApi();
  return useQuery({
    queryKey: moneyKeys.upcoming(days),
    queryFn: async () =>
      (
        await api.request<{ items: Subscription[] }>('GET', '/subscriptions/upcoming', {
          query: { days },
        })
      ).items,
  });
}

/**
 * Creates the transactions of repeat rules that are due, once when the Money page opens, and
 * refreshes everything when it made any. A failure is ignored: the pages show their own errors.
 */
export function useRunRecurring(): void {
  const api = useApi();
  const client = useQueryClient();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    api
      .request<{ created: Transaction[] }>('POST', '/recurring-transactions/run')
      .then(({ created }) => {
        if (created.length === 0) return undefined;
        // A list still on its first fetch ignores an invalidation, and would miss the new rows
        return client
          .cancelQueries({ queryKey: MONEY_KEY })
          .then(() => client.invalidateQueries({ queryKey: MONEY_KEY }));
      })
      .catch(() => undefined);
  }, [api, client]);
}
