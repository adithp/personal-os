import { transactions } from '@personal-os/db';
import {
  addMonthsToMonth,
  financeActions,
  monthEnd,
  monthOf,
  monthStart,
  type CategoryKind,
  type MonthSummary,
} from '@personal-os/shared';
import { gte, lt } from 'drizzle-orm';
import { andAll, todayInIndia } from './money-common';
import { implement } from './registry';

/** The monthly report (docs/features/money.md): income and expense, transfers left out. */

export const summaryImplementations = [
  implement(financeActions.summary, async ({ scope }, { month }) => {
    const wanted = month ?? monthOf(todayInIndia());
    const previous = addMonthsToMonth(wanted, -1);
    // The previous month comes in the same query for previousExpensePaise
    const rows = await scope.select(transactions, {
      where: andAll(
        scope.isLive(transactions),
        gte(transactions.occurredOn, monthStart(previous)),
        lt(transactions.occurredOn, monthEnd(wanted)),
      ),
    });

    let income = 0;
    let expense = 0;
    let previousExpense = 0;
    const categoryTotals = new Map<string, { categoryId: string | null; kind: CategoryKind; total: number }>();
    const days = new Map<string, { incomePaise: number; expensePaise: number }>();

    for (const row of rows) {
      if (row.kind === 'transfer') continue;
      const kind = row.kind as CategoryKind;
      if (monthOf(row.occurredOn) === previous) {
        if (kind === 'expense') previousExpense += row.amountPaise;
        continue;
      }
      if (kind === 'income') income += row.amountPaise;
      else expense += row.amountPaise;

      const key = `${kind}:${row.categoryId ?? ''}`;
      const entry = categoryTotals.get(key) ?? { categoryId: row.categoryId, kind, total: 0 };
      entry.total += row.amountPaise;
      categoryTotals.set(key, entry);

      const day = days.get(row.occurredOn) ?? { incomePaise: 0, expensePaise: 0 };
      if (kind === 'income') day.incomePaise += row.amountPaise;
      else day.expensePaise += row.amountPaise;
      days.set(row.occurredOn, day);
    }

    const summary: MonthSummary = {
      month: wanted,
      incomePaise: income,
      expensePaise: expense,
      netPaise: income - expense,
      previousExpensePaise: previousExpense,
      byCategory: [...categoryTotals.values()]
        .filter((entry) => entry.total !== 0)
        .sort((a, b) => b.total - a.total)
        .map((entry) => ({
          categoryId: entry.categoryId,
          kind: entry.kind,
          totalPaise: entry.total,
        })),
      byDay: [...days.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, totals]) => ({ date, ...totals })),
    };
    return { data: summary };
  }),
];
