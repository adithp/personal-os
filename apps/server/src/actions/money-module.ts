import type { ActionDefinition } from '@personal-os/shared';
import { budgetImplementations } from './money-budgets';
import { categoryImplementations } from './money-categories';
import { goalImplementations } from './money-goals';
import { recurringImplementations } from './money-recurring';
import { subscriptionImplementations } from './money-subscriptions';
import { summaryImplementations } from './money-summary';
import { transactionImplementations } from './money-transactions';
import { walletImplementations } from './money-wallets';
import type { ActionImplementation } from './registry';

/** Money lane: every Finance, Wallet and Subscriptions action (docs/features/money.md). */
export const moneyImplementations: readonly ActionImplementation<ActionDefinition>[] = [
  ...walletImplementations,
  ...categoryImplementations,
  ...transactionImplementations,
  ...recurringImplementations,
  ...budgetImplementations,
  ...goalImplementations,
  ...summaryImplementations,
  ...subscriptionImplementations,
] as readonly ActionImplementation<ActionDefinition>[];
