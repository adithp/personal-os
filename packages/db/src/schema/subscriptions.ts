import { BILLING_CYCLES, SUBSCRIPTION_STATUSES } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';
import { categories, wallets } from './finance';

/**
 * Money module, Subscriptions table (docs/features/subscriptions.md). Amount is integer paise, the
 * renewal day is an India calendar day (`date` read as YYYY-MM-DD).
 */
const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const subscriptions = pgTable(
  'subscriptions',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    cycle: text('cycle').notNull().default('monthly'),
    nextRenewalOn: date('next_renewal_on', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('active'),
    walletId: uuid('wallet_id'),
    categoryId: uuid('category_id'),
    color: text('color').notNull(),
    note: text('note'),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'subscriptions_wallet_fk',
      columns: [table.walletId, table.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: 'subscriptions_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('subscriptions_cycle_check', sql`${table.cycle} in (${sqlList(BILLING_CYCLES)})`),
    check(
      'subscriptions_status_check',
      sql`${table.status} in (${sqlList(SUBSCRIPTION_STATUSES)})`,
    ),
    check('subscriptions_amount_check', sql`${table.amountPaise} > 0`),
    index('subscriptions_user_renewal_idx').on(table.userId, table.nextRenewalOn),
    ownRowsPolicy('subscriptions', table.userId),
  ],
).enableRLS();

export type SubscriptionRow = typeof subscriptions.$inferSelect;
