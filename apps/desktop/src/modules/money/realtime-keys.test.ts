import { describe, expect, it } from 'vitest';
import { realtimeRegistry } from '../../realtime/registry';

describe('Money live updates', () => {
  it('refreshes every Money query when any Money table changes', () => {
    for (const table of [
      'wallets',
      'categories',
      'transactions',
      'recurring_transactions',
      'budgets',
      'savings_goals',
      'subscriptions',
    ] as const) {
      expect(realtimeRegistry[table]).toEqual([['money']]);
    }
  });
});
