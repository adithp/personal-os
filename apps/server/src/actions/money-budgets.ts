import { budgets, categories, transactions } from '@personal-os/db';
import { financeActions, monthEnd, monthOf, monthStart } from '@personal-os/shared';
import { asc, eq, gte, lt } from 'drizzle-orm';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { andAll, notFound, requireCategory, todayInIndia, toBudget } from './money-common';
import { implement } from './registry';

/**
 * Budgets (docs/features/money.md): one amount per expense category per month, with the spent
 * amount of live expense transactions. Budgets are hard-deleted (undo = set again).
 */

/** Spent paise per category over the live expense transactions of a month. */
async function spentByCategory(scope: UserScope, month: string): Promise<Map<string, number>> {
  const rows = await scope.select(transactions, {
    where: andAll(
      scope.isLive(transactions),
      eq(transactions.kind, 'expense'),
      gte(transactions.occurredOn, monthStart(month)),
      lt(transactions.occurredOn, monthEnd(month)),
    ),
  });
  const spent = new Map<string, number>();
  for (const row of rows) {
    if (row.categoryId)
      spent.set(row.categoryId, (spent.get(row.categoryId) ?? 0) + row.amountPaise);
  }
  return spent;
}

export const budgetImplementations = [
  implement(financeActions.budgetsList, async ({ scope }, { month }) => {
    const wanted = month ?? monthOf(todayInIndia());
    const rows = await scope.select(budgets, {
      where: eq(budgets.month, monthStart(wanted)),
      orderBy: [asc(budgets.createdAt), asc(budgets.id)],
    });
    const live = new Set(
      (await scope.select(categories, { where: scope.isLive(categories) })).map((row) => row.id),
    );
    const spent = await spentByCategory(scope, wanted);
    return {
      data: rows
        .filter((row) => live.has(row.categoryId))
        .map((row) => toBudget(row, spent.get(row.categoryId) ?? 0)),
    };
  }),

  implement(financeActions.budgetsSet, ({ scope }, input) =>
    withUserLock('money-budgets', scope.userId, () =>
      scope.transaction(async (tx) => {
        await requireCategory(tx, input.categoryId, 'expense');
        const [existing] = await tx.select(budgets, {
          where: andAll(
            eq(budgets.categoryId, input.categoryId),
            eq(budgets.month, monthStart(input.month)),
          ),
          limit: 1,
        });
        const spent = (await spentByCategory(tx, input.month)).get(input.categoryId) ?? 0;
        if (existing) {
          if (existing.amountPaise === input.amountPaise) {
            return { data: toBudget(existing, spent), undo: null };
          }
          const [updated] = await tx.update(
            budgets,
            { amountPaise: input.amountPaise, updatedAt: new Date() },
            eq(budgets.id, existing.id),
          );
          if (!updated) throw notFound('Budget');
          return {
            data: toBudget(updated, spent),
            undo: {
              action: 'finance.budgets.set',
              input: {
                categoryId: input.categoryId,
                month: input.month,
                amountPaise: existing.amountPaise,
              },
            },
          };
        }
        const [created] = await tx.insert(budgets, {
          categoryId: input.categoryId,
          month: monthStart(input.month),
          amountPaise: input.amountPaise,
        });
        if (!created) throw new Error('Could not create the budget');
        return {
          data: toBudget(created, spent),
          undo: { action: 'finance.budgets.delete', input: { id: created.id } },
        };
      }),
    ),
  ),

  implement(financeActions.budgetsDelete, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const [current] = await tx.select(budgets, { where: eq(budgets.id, id), limit: 1 });
      if (!current) throw notFound('Budget');
      const month = monthOf(current.month);
      const spent = (await spentByCategory(tx, month)).get(current.categoryId) ?? 0;
      await tx.delete(budgets, eq(budgets.id, id));
      return {
        data: toBudget(current, spent),
        undo: {
          action: 'finance.budgets.set',
          input: { categoryId: current.categoryId, month, amountPaise: current.amountPaise },
        },
      };
    }),
  ),
];
