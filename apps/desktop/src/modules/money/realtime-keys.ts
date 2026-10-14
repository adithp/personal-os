import type { RealtimeKeys } from '../../realtime/registry';
import { MONEY_KEY } from './query-keys';

/**
 * Balances, budget progress, goals and the summary all depend on each other, so a change in any
 * Money table refreshes every cached Money query.
 */
export const moneyRealtimeKeys: RealtimeKeys = {
  wallets: [MONEY_KEY],
  categories: [MONEY_KEY],
  transactions: [MONEY_KEY],
  recurring_transactions: [MONEY_KEY],
  budgets: [MONEY_KEY],
  savings_goals: [MONEY_KEY],
  subscriptions: [MONEY_KEY],
};
