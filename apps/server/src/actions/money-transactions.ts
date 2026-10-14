import { transactions } from '@personal-os/db';
import { financeActions, type TransactionKind } from '@personal-os/shared';
import { desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import {
  andAll,
  changes,
  checkShape,
  findAny,
  findLive,
  notFound,
  requireWallet,
  softDeleteLive,
  todayInIndia,
  toTransaction,
  undelete,
  updateLive,
} from './money-common';
import { implement } from './registry';

/** Transactions (docs/features/money.md): income, expense, and transfers between two wallets. */

const FIELDS = [
  'kind',
  'amountPaise',
  'occurredOn',
  'walletId',
  'toWalletId',
  'categoryId',
  'note',
];

/** Escapes % and _ so the text is searched literally. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

export const transactionImplementations = [
  implement(financeActions.transactionsList, async ({ scope }, input) => {
    const rows = await scope.select(transactions, {
      where: andAll(
        scope.isLive(transactions),
        input.walletId
          ? or(
              eq(transactions.walletId, input.walletId),
              eq(transactions.toWalletId, input.walletId),
            )
          : undefined,
        input.categoryId ? eq(transactions.categoryId, input.categoryId) : undefined,
        input.kind ? eq(transactions.kind, input.kind) : undefined,
        input.from ? gte(transactions.occurredOn, input.from) : undefined,
        input.to ? lte(transactions.occurredOn, input.to) : undefined,
        input.q ? ilike(transactions.note, likePattern(input.q)) : undefined,
      ),
      orderBy: [desc(transactions.occurredOn), desc(transactions.createdAt), desc(transactions.id)],
      limit: input.limit,
      offset: input.offset,
    });
    return { data: rows.map(toTransaction) };
  }),

  implement(financeActions.transactionsCreate, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      await checkShape(tx, input);
      const [row] = await tx.insert(transactions, {
        kind: input.kind,
        amountPaise: input.amountPaise,
        occurredOn: input.occurredOn ?? todayInIndia(),
        walletId: input.walletId,
        toWalletId: input.toWalletId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
      });
      if (!row) throw new Error('Could not create the transaction');
      return {
        data: toTransaction(row),
        undo: { action: 'finance.transactions.delete', input: { id: row.id } },
      };
    }),
  ),

  implement(financeActions.transactionsUpdate, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      const current = await findLive(tx, transactions, input.id);
      if (!current) throw notFound('Transaction');
      const { values, old } = changes(current, input, FIELDS);
      if (Object.keys(values).length === 0) return { data: toTransaction(current), undo: null };
      const merged = { ...current, ...values };
      await checkShape(
        tx,
        { ...merged, kind: merged.kind as TransactionKind },
        {
          wallets: 'walletId' in values || 'toWalletId' in values,
          category: 'categoryId' in values || 'kind' in values,
        },
      );
      const updated = await updateLive(tx, transactions, input.id, values);
      if (!updated) throw notFound('Transaction');
      return {
        data: toTransaction(updated),
        undo: { action: 'finance.transactions.update', input: { id: input.id, ...old } },
      };
    }),
  ),

  implement(financeActions.transactionsDelete, async ({ scope }, { id }) => {
    const deleted = await softDeleteLive(scope, transactions, id);
    if (!deleted) throw notFound('Transaction');
    return {
      data: toTransaction(deleted),
      undo: { action: 'finance.transactions.restore', input: { id } },
    };
  }),

  implement(financeActions.transactionsRestore, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const current = await findAny(tx, transactions, id);
      if (!current) throw notFound('Transaction');
      if (current.deletedAt === null) return { data: toTransaction(current), undo: null };
      await requireWallet(tx, current.walletId);
      if (current.toWalletId) await requireWallet(tx, current.toWalletId);
      const restored = await undelete(tx, transactions, id);
      if (!restored) throw notFound('Transaction');
      return {
        data: toTransaction(restored),
        undo: { action: 'finance.transactions.delete', input: { id } },
      };
    }),
  ),
];
