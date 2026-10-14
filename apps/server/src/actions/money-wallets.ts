import { recurringTransactions, subscriptions, transactions, wallets } from '@personal-os/db';
import { financeActions } from '@personal-os/shared';
import { asc, eq, isNull, or } from 'drizzle-orm';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import {
  andAll,
  changes,
  conflict,
  DEFAULT_COLOR,
  findAny,
  findLive,
  notFound,
  softDeleteLive,
  toWallet,
  undelete,
  updateLive,
  walletDeltas,
} from './money-common';
import { implement } from './registry';

/** Wallets (docs/features/money.md): balances are computed from live transactions on every list. */

const nameTaken = () => conflict('name_taken', 'A wallet with this name already exists');

/** Another live wallet (archived ones count) already has this name, ignoring case. */
async function assertNameFree(scope: UserScope, name: string, exceptId?: string): Promise<void> {
  const live = await scope.select(wallets, { where: scope.isLive(wallets) });
  const wanted = name.toLowerCase();
  if (live.some((row) => row.id !== exceptId && row.name.toLowerCase() === wanted)) {
    throw nameTaken();
  }
}

const withBalance = async (scope: UserScope, row: typeof wallets.$inferSelect) =>
  toWallet(row, await walletDeltas(scope));

/** True when a live transaction, repeat or subscription uses the wallet. */
async function walletInUse(scope: UserScope, id: string): Promise<boolean> {
  const [transaction] = await scope.select(transactions, {
    where: andAll(
      scope.isLive(transactions),
      or(eq(transactions.walletId, id), eq(transactions.toWalletId, id)),
    ),
    limit: 1,
  });
  if (transaction) return true;
  const [repeat] = await scope.select(recurringTransactions, {
    where: andAll(
      scope.isLive(recurringTransactions),
      or(eq(recurringTransactions.walletId, id), eq(recurringTransactions.toWalletId, id)),
    ),
    limit: 1,
  });
  if (repeat) return true;
  const [subscription] = await scope.select(subscriptions, {
    where: andAll(scope.isLive(subscriptions), eq(subscriptions.walletId, id)),
    limit: 1,
  });
  return subscription !== undefined;
}

export const walletImplementations = [
  implement(financeActions.walletsList, async ({ scope }, { includeArchived }) => {
    const rows = await scope.select(wallets, {
      where: includeArchived
        ? scope.isLive(wallets)
        : andAll(scope.isLive(wallets), isNull(wallets.archivedAt)),
      orderBy: [asc(wallets.createdAt), asc(wallets.id)],
    });
    const deltas = await walletDeltas(scope);
    return { data: rows.map((row) => toWallet(row, deltas)) };
  }),

  implement(financeActions.walletsCreate, ({ scope }, input) =>
    withUserLock('money-wallets', scope.userId, () =>
      scope.transaction(async (tx) => {
        await assertNameFree(tx, input.name);
        const [row] = await tx.insert(wallets, {
          name: input.name,
          kind: input.kind,
          color: input.color ?? DEFAULT_COLOR,
          openingBalancePaise: input.openingBalancePaise,
        });
        if (!row) throw new Error('Could not create the wallet');
        return {
          data: await withBalance(tx, row),
          undo: { action: 'finance.wallets.delete', input: { id: row.id } },
        };
      }),
    ),
  ),

  implement(financeActions.walletsUpdate, ({ scope }, input) =>
    withUserLock('money-wallets', scope.userId, () =>
      scope.transaction(async (tx) => {
        const current = await findLive(tx, wallets, input.id);
        if (!current) throw notFound('Wallet');
        const { values, old } = changes(current, input, [
          'name',
          'kind',
          'color',
          'openingBalancePaise',
        ]);
        if (typeof values.name === 'string') await assertNameFree(tx, values.name, current.id);
        const wasArchived = current.archivedAt !== null;
        if (input.archived !== undefined && input.archived !== wasArchived) {
          values.archivedAt = input.archived ? new Date() : null;
          old.archived = wasArchived;
        }
        if (Object.keys(values).length === 0) {
          return { data: await withBalance(tx, current), undo: null };
        }
        const updated = await updateLive(tx, wallets, input.id, values);
        if (!updated) throw notFound('Wallet');
        return {
          data: await withBalance(tx, updated),
          undo: { action: 'finance.wallets.update', input: { id: input.id, ...old } },
        };
      }),
    ),
  ),

  implement(financeActions.walletsDelete, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const current = await findLive(tx, wallets, id);
      if (!current) throw notFound('Wallet');
      if (await walletInUse(tx, id)) {
        throw conflict('wallet_in_use', 'This wallet has transactions. Archive it instead.');
      }
      const deleted = await softDeleteLive(tx, wallets, id);
      if (!deleted) throw notFound('Wallet');
      return {
        data: await withBalance(tx, deleted),
        undo: { action: 'finance.wallets.restore', input: { id } },
      };
    }),
  ),

  implement(financeActions.walletsRestore, ({ scope }, { id }) =>
    withUserLock('money-wallets', scope.userId, () =>
      scope.transaction(async (tx) => {
        const current = await findAny(tx, wallets, id);
        if (!current) throw notFound('Wallet');
        if (current.deletedAt === null) return { data: await withBalance(tx, current), undo: null };
        await assertNameFree(tx, current.name);
        const restored = await undelete(tx, wallets, id);
        if (!restored) throw notFound('Wallet');
        return {
          data: await withBalance(tx, restored),
          undo: { action: 'finance.wallets.delete', input: { id } },
        };
      }),
    ),
  ),
];
