import { recurringTransactions, transactions } from '@personal-os/db';
import { financeActions, nextRuleDay, type TransactionKind } from '@personal-os/shared';
import { asc, eq, lte } from 'drizzle-orm';
import { withUserLock } from '../lib/user-lock';
import {
  andAll,
  changes,
  checkShape,
  findAny,
  findLive,
  invalid,
  notFound,
  requireWallet,
  softDeleteLive,
  todayInIndia,
  toRecurring,
  toTransaction,
  undelete,
  updateLive,
} from './money-common';
import { implement } from './registry';

/** Repeating transactions (docs/features/money.md): a template, a rule and the next due day. */

const FIELDS = [
  'amountPaise',
  'walletId',
  'toWalletId',
  'categoryId',
  'note',
  'rule',
  'nextOn',
  'endsOn',
  'active',
];

/** Most transactions one rule makes in one run (a daily rule left alone for a year). */
const MAX_PER_RULE = 366;

export const recurringImplementations = [
  implement(financeActions.recurringList, async ({ scope }) => {
    const rows = await scope.select(recurringTransactions, {
      where: scope.isLive(recurringTransactions),
      orderBy: [asc(recurringTransactions.nextOn), asc(recurringTransactions.createdAt)],
    });
    return { data: rows.map(toRecurring) };
  }),

  implement(financeActions.recurringCreate, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      await checkShape(tx, input);
      const nextOn = input.startOn ?? todayInIndia();
      if (input.endsOn && input.endsOn < nextOn) throw invalid('The end day is before the start');
      const [row] = await tx.insert(recurringTransactions, {
        kind: input.kind,
        amountPaise: input.amountPaise,
        walletId: input.walletId,
        toWalletId: input.toWalletId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
        rule: input.rule,
        nextOn,
        endsOn: input.endsOn ?? null,
      });
      if (!row) throw new Error('Could not create the repeating transaction');
      return {
        data: toRecurring(row),
        undo: { action: 'finance.recurring.delete', input: { id: row.id } },
      };
    }),
  ),

  implement(financeActions.recurringUpdate, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      const current = await findLive(tx, recurringTransactions, input.id);
      if (!current) throw notFound('Repeating transaction');
      const { values, old } = changes(current, input, FIELDS);
      if (Object.keys(values).length === 0) return { data: toRecurring(current), undo: null };
      const merged = { ...current, ...values } as typeof current;
      if (('endsOn' in values || 'nextOn' in values) && merged.endsOn && merged.endsOn < merged.nextOn) {
        throw invalid('The end day is before the next day of this repeat');
      }
      await checkShape(
        tx,
        { ...merged, kind: merged.kind as TransactionKind },
        {
          wallets: 'walletId' in values || 'toWalletId' in values,
          category: 'categoryId' in values,
        },
      );
      const updated = await updateLive(tx, recurringTransactions, input.id, values);
      if (!updated) throw notFound('Repeating transaction');
      return {
        data: toRecurring(updated),
        undo: { action: 'finance.recurring.update', input: { id: input.id, ...old } },
      };
    }),
  ),

  implement(financeActions.recurringDelete, async ({ scope }, { id }) => {
    const deleted = await softDeleteLive(scope, recurringTransactions, id);
    if (!deleted) throw notFound('Repeating transaction');
    return {
      data: toRecurring(deleted),
      undo: { action: 'finance.recurring.restore', input: { id } },
    };
  }),

  implement(financeActions.recurringRestore, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const current = await findAny(tx, recurringTransactions, id);
      if (!current) throw notFound('Repeating transaction');
      if (current.deletedAt === null) return { data: toRecurring(current), undo: null };
      await requireWallet(tx, current.walletId);
      if (current.toWalletId) await requireWallet(tx, current.toWalletId);
      const restored = await undelete(tx, recurringTransactions, id);
      if (!restored) throw notFound('Repeating transaction');
      return {
        data: toRecurring(restored),
        undo: { action: 'finance.recurring.delete', input: { id } },
      };
    }),
  ),

  // Creates every due transaction up to today and moves each rule on. Safe to call again.
  implement(financeActions.recurringRun, ({ scope }) =>
    withUserLock('money-recurring', scope.userId, () =>
      scope.transaction(async (tx) => {
        const today = todayInIndia();
        const due = await tx.select(recurringTransactions, {
          where: andAll(
            tx.isLive(recurringTransactions),
            eq(recurringTransactions.active, true),
            lte(recurringTransactions.nextOn, today),
          ),
          orderBy: [asc(recurringTransactions.nextOn), asc(recurringTransactions.createdAt)],
        });
        const rows: Omit<typeof transactions.$inferInsert, 'userId'>[] = [];
        for (const rule of due) {
          let next = rule.nextOn;
          let active = true;
          let made = 0;
          while (next <= today && made < MAX_PER_RULE) {
            if (rule.endsOn && next > rule.endsOn) break;
            rows.push({
              kind: rule.kind,
              amountPaise: rule.amountPaise,
              occurredOn: next,
              walletId: rule.walletId,
              toWalletId: rule.toWalletId,
              categoryId: rule.categoryId,
              note: rule.note,
              recurringId: rule.id,
            });
            made += 1;
            const following = nextRuleDay(rule.rule, next);
            if (!following) {
              active = false;
              break;
            }
            next = following;
          }
          if (rule.endsOn && next > rule.endsOn) active = false;
          await tx.update(
            recurringTransactions,
            { nextOn: next, active, updatedAt: new Date() },
            eq(recurringTransactions.id, rule.id),
          );
        }
        const created = await tx.insert(transactions, rows);
        return { data: { created: created.map(toTransaction) }, undo: null };
      }),
    ),
  ),
];
