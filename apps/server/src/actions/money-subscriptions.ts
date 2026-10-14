import { subscriptions, transactions } from '@personal-os/db';
import {
  addDays,
  addMonths,
  subscriptionActions,
  type BillingCycle,
  type RenewResult,
  type SubscriptionSummary,
} from '@personal-os/shared';
import { asc, eq } from 'drizzle-orm';
import {
  andAll,
  changes,
  conflict,
  DEFAULT_COLOR,
  findAny,
  findLive,
  notFound,
  requireCategory,
  requireWallet,
  softDeleteLive,
  todayInIndia,
  toSubscription,
  toTransaction,
  undelete,
  updateLive,
} from './money-common';
import { implement } from './registry';

/** Subscriptions (docs/features/money.md): renewals, the upcoming list and the overdue state. */

const FIELDS = [
  'name',
  'amountPaise',
  'cycle',
  'nextRenewalOn',
  'status',
  'walletId',
  'categoryId',
  'color',
  'note',
];

/** The day one billing cycle after `day`. */
function advance(day: string, cycle: BillingCycle): string {
  if (cycle === 'weekly') return addDays(day, 7);
  return addMonths(day, cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12);
}

export const subscriptionImplementations = [
  implement(subscriptionActions.list, async ({ scope }, { status }) => {
    const today = todayInIndia();
    const rows = await scope.select(subscriptions, {
      where: scope.isLive(subscriptions),
      orderBy: [asc(subscriptions.nextRenewalOn), asc(subscriptions.createdAt), asc(subscriptions.id)],
    });
    const all = rows.map((row) => toSubscription(row, today));
    const active = all.filter((item) => item.status === 'active');
    const summary: SubscriptionSummary = {
      activeCount: active.length,
      monthlyPaise: active.reduce((sum, item) => sum + item.monthlyPaise, 0),
      yearlyPaise: active.reduce((sum, item) => sum + item.yearlyPaise, 0),
    };
    return { data: { items: status ? all.filter((item) => item.status === status) : all, summary } };
  }),

  implement(subscriptionActions.upcoming, async ({ scope }, { days }) => {
    const today = todayInIndia();
    const last = addDays(today, days);
    const rows = await scope.select(subscriptions, {
      where: andAll(scope.isLive(subscriptions), eq(subscriptions.status, 'active')),
      orderBy: [asc(subscriptions.nextRenewalOn), asc(subscriptions.createdAt), asc(subscriptions.id)],
    });
    return {
      data: rows.filter((row) => row.nextRenewalOn <= last).map((row) => toSubscription(row, today)),
    };
  }),

  implement(subscriptionActions.create, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      if (input.walletId) await requireWallet(tx, input.walletId);
      if (input.categoryId) await requireCategory(tx, input.categoryId, 'expense');
      const [row] = await tx.insert(subscriptions, {
        name: input.name,
        amountPaise: input.amountPaise,
        cycle: input.cycle,
        nextRenewalOn: input.nextRenewalOn,
        walletId: input.walletId ?? null,
        categoryId: input.categoryId ?? null,
        color: input.color ?? DEFAULT_COLOR,
        note: input.note ?? null,
      });
      if (!row) throw new Error('Could not create the subscription');
      return {
        data: toSubscription(row, todayInIndia()),
        undo: { action: 'subscriptions.delete', input: { id: row.id } },
      };
    }),
  ),

  implement(subscriptionActions.update, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      const today = todayInIndia();
      const current = await findLive(tx, subscriptions, input.id);
      if (!current) throw notFound('Subscription');
      const { values, old } = changes(current, input, FIELDS);
      if (Object.keys(values).length === 0) {
        return { data: toSubscription(current, today), undo: null };
      }
      if (typeof values.walletId === 'string') await requireWallet(tx, values.walletId);
      if (typeof values.categoryId === 'string') {
        await requireCategory(tx, values.categoryId, 'expense');
      }
      const updated = await updateLive(tx, subscriptions, input.id, values);
      if (!updated) throw notFound('Subscription');
      return {
        data: toSubscription(updated, today),
        undo: { action: 'subscriptions.update', input: { id: input.id, ...old } },
      };
    }),
  ),

  // "Mark paid": moves the renewal day on and (with a wallet) books the expense
  implement(subscriptionActions.renew, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      const today = todayInIndia();
      const current = await findLive(tx, subscriptions, input.id);
      if (!current) throw notFound('Subscription');
      if (current.status !== 'active') {
        throw conflict('not_active', 'Only an active subscription can be renewed');
      }
      const paidOn = input.paidOn ?? today;
      const cycle = current.cycle as BillingCycle;
      let next = advance(current.nextRenewalOn, cycle);
      for (let guard = 0; next <= paidOn && guard < 1000; guard += 1) next = advance(next, cycle);

      const updated = await updateLive(tx, subscriptions, input.id, { nextRenewalOn: next });
      if (!updated) throw notFound('Subscription');

      let booked = null;
      if (input.createTransaction && current.walletId) {
        const [row] = await tx.insert(transactions, {
          kind: 'expense',
          amountPaise: current.amountPaise,
          occurredOn: paidOn,
          walletId: current.walletId,
          categoryId: current.categoryId,
          note: current.name,
          subscriptionId: current.id,
        });
        booked = row ?? null;
      }
      const data: RenewResult = {
        subscription: toSubscription(updated, today),
        transaction: booked ? toTransaction(booked) : null,
      };
      return {
        data,
        undo: {
          action: 'subscriptions.undo_renew',
          input: {
            id: input.id,
            previousRenewalOn: current.nextRenewalOn,
            transactionId: booked?.id ?? null,
          },
        },
      };
    }),
  ),

  implement(subscriptionActions.undoRenew, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      const current = await findLive(tx, subscriptions, input.id);
      if (!current) throw notFound('Subscription');
      if (input.transactionId) {
        await tx.softDelete(
          transactions,
          andAll(
            eq(transactions.id, input.transactionId),
            eq(transactions.subscriptionId, input.id),
            tx.isLive(transactions),
          ),
        );
      }
      const updated = await updateLive(tx, subscriptions, input.id, {
        nextRenewalOn: input.previousRenewalOn,
      });
      if (!updated) throw notFound('Subscription');
      return { data: toSubscription(updated, todayInIndia()), undo: null };
    }),
  ),

  implement(subscriptionActions.delete, async ({ scope }, { id }) => {
    const deleted = await softDeleteLive(scope, subscriptions, id);
    if (!deleted) throw notFound('Subscription');
    return {
      data: toSubscription(deleted, todayInIndia()),
      undo: { action: 'subscriptions.restore', input: { id } },
    };
  }),

  implement(subscriptionActions.restore, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const current = await findAny(tx, subscriptions, id);
      if (!current) throw notFound('Subscription');
      const today = todayInIndia();
      if (current.deletedAt === null) return { data: toSubscription(current, today), undo: null };
      if (current.walletId) await requireWallet(tx, current.walletId);
      const restored = await undelete(tx, subscriptions, id);
      if (!restored) throw notFound('Subscription');
      return {
        data: toSubscription(restored, today),
        undo: { action: 'subscriptions.delete', input: { id } },
      };
    }),
  ),
];
