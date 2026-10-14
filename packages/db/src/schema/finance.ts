import { CATEGORY_KINDS, TRANSACTION_KINDS, WALLET_KINDS } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';

/**
 * Money module, Finance and Wallet tables (docs/DATABASE.md, docs/features/money.md). Plain tables
 * (not entities). Money is integer paise (bigint read as a JS number: amounts stay far below 2^53).
 * Dates of transactions are India calendar days (`date` columns read as YYYY-MM-DD strings).
 */
const paise = (name: string) => bigint(name, { mode: 'number' });

const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const wallets = pgTable(
  'wallets',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('bank'),
    color: text('color').notNull(),
    /** What was in the wallet before the first transaction; may be negative (a card). */
    openingBalancePaise: paise('opening_balance_paise').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...deletedAtColumn(),
  },
  (table) => [
    unique('wallets_id_user_id_key').on(table.id, table.userId),
    check('wallets_kind_check', sql`${table.kind} in (${sqlList(WALLET_KINDS)})`),
    uniqueIndex('wallets_name_idx')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
    index('wallets_user_id_idx').on(table.userId),
    ownRowsPolicy('wallets', table.userId),
  ],
).enableRLS();

export const categories = pgTable(
  'categories',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    color: text('color').notNull(),
    ...deletedAtColumn(),
  },
  (table) => [
    unique('categories_id_user_id_key').on(table.id, table.userId),
    check('categories_kind_check', sql`${table.kind} in (${sqlList(CATEGORY_KINDS)})`),
    uniqueIndex('categories_name_idx')
      .on(table.userId, table.kind, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
    index('categories_user_id_idx').on(table.userId),
    ownRowsPolicy('categories', table.userId),
  ],
).enableRLS();

/** A repeating transaction: a template plus the next day it is due. */
export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    ...baseColumns(),
    kind: text('kind').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    walletId: uuid('wallet_id').notNull(),
    toWalletId: uuid('to_wallet_id'),
    categoryId: uuid('category_id'),
    note: text('note'),
    /** One of the presets of recurrence.ts (RRULE text). */
    rule: text('rule').notNull(),
    nextOn: date('next_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    active: boolean('active').notNull().default(true),
    ...deletedAtColumn(),
  },
  (table) => [
    unique('recurring_transactions_id_user_id_key').on(table.id, table.userId),
    foreignKey({
      name: 'recurring_wallet_fk',
      columns: [table.walletId, table.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: 'recurring_to_wallet_fk',
      columns: [table.toWalletId, table.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: 'recurring_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('recurring_kind_check', sql`${table.kind} in (${sqlList(TRANSACTION_KINDS)})`),
    check('recurring_amount_check', sql`${table.amountPaise} > 0`),
    index('recurring_user_next_idx').on(table.userId, table.nextOn),
    ownRowsPolicy('recurring_transactions', table.userId),
  ],
).enableRLS();

export const transactions = pgTable(
  'transactions',
  {
    ...baseColumns(),
    kind: text('kind').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    walletId: uuid('wallet_id').notNull(),
    /** Transfers only. */
    toWalletId: uuid('to_wallet_id'),
    categoryId: uuid('category_id'),
    note: text('note'),
    recurringId: uuid('recurring_id'),
    /** Set by a subscription renewal (the subscriptions table is in subscriptions.ts; no FK here to keep the files apart). */
    subscriptionId: uuid('subscription_id'),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'transactions_wallet_fk',
      columns: [table.walletId, table.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: 'transactions_to_wallet_fk',
      columns: [table.toWalletId, table.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: 'transactions_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    foreignKey({
      name: 'transactions_recurring_fk',
      columns: [table.recurringId, table.userId],
      foreignColumns: [recurringTransactions.id, recurringTransactions.userId],
    }),
    check('transactions_kind_check', sql`${table.kind} in (${sqlList(TRANSACTION_KINDS)})`),
    check('transactions_amount_check', sql`${table.amountPaise} > 0`),
    check(
      'transactions_transfer_check',
      sql`(${table.kind} = 'transfer' and ${table.toWalletId} is not null and ${table.toWalletId} <> ${table.walletId})
        or (${table.kind} <> 'transfer' and ${table.toWalletId} is null)`,
    ),
    index('transactions_user_day_idx').on(table.userId, table.occurredOn),
    index('transactions_wallet_idx').on(table.walletId),
    index('transactions_category_idx').on(table.categoryId),
    ownRowsPolicy('transactions', table.userId),
  ],
).enableRLS();

/** The most a category may spend in a month. `month` is the first day of the month. */
export const budgets = pgTable(
  'budgets',
  {
    ...baseColumns(),
    categoryId: uuid('category_id').notNull(),
    month: date('month', { mode: 'string' }).notNull(),
    amountPaise: paise('amount_paise').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'budgets_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('budgets_amount_check', sql`${table.amountPaise} > 0`),
    unique('budgets_category_month_key').on(table.userId, table.categoryId, table.month),
    index('budgets_user_month_idx').on(table.userId, table.month),
    ownRowsPolicy('budgets', table.userId),
  ],
).enableRLS();

export const savingsGoals = pgTable(
  'savings_goals',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    targetPaise: paise('target_paise').notNull(),
    savedPaise: paise('saved_paise').notNull().default(0),
    targetOn: date('target_on', { mode: 'string' }),
    color: text('color').notNull(),
    ...deletedAtColumn(),
  },
  (table) => [
    check('savings_goals_target_check', sql`${table.targetPaise} > 0`),
    check('savings_goals_saved_check', sql`${table.savedPaise} >= 0`),
    index('savings_goals_user_id_idx').on(table.userId),
    ownRowsPolicy('savings_goals', table.userId),
  ],
).enableRLS();

export type WalletRow = typeof wallets.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type RecurringTransactionRow = typeof recurringTransactions.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type SavingsGoalRow = typeof savingsGoals.$inferSelect;
