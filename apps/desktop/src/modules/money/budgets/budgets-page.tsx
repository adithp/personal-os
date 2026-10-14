import { formatInr, type Budget } from '@personal-os/shared';
import { Button, GlassCard } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useBudgets, useCategories } from '../money-queries';
import { useMoneyKeys } from '../shell/use-money-keys';
import { ColorDot } from '../ui/fields';
import { MoneyBar } from '../ui/money-bar';
import { EmptyBlock, ErrorBlock, LoadingBlock, MonthSwitcher, PageHeader } from '../ui/page-parts';
import { useMoneyNav } from '../use-money-nav';
import { BudgetDialog } from './budget-dialog';

type Editing = Budget | 'new' | null;

/** Budgets: one progress bar per expense category with a budget in the month. */
export function BudgetsPage() {
  const nav = useMoneyNav();
  const { month } = nav;
  const budgets = useBudgets(month);
  const categories = useCategories();
  const [editing, setEditing] = useState<Editing>(null);
  useMoneyKeys({
    months: true,
    onNew: () => {
      setEditing('new');
    },
  });

  const expense = useMemo(
    () => (categories.data ?? []).filter((category) => category.kind === 'expense'),
    [categories.data],
  );
  const byId = useMemo(() => new Map(expense.map((c) => [c.id, c])), [expense]);
  const items = budgets.data ?? [];
  const free = expense.filter((c) => !items.some((b) => b.categoryId === c.id));
  const error = budgets.isError ? budgets : categories.isError ? categories : null;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-2 pb-6">
      <PageHeader title="Budgets">
        <MonthSwitcher month={month} onStep={nav.stepMonth} />
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          <IconPlus size={16} stroke={1.5} aria-hidden />
          Set a budget
        </Button>
      </PageHeader>

      {error ? (
        <ErrorBlock
          error={error.error}
          fallback="Could not load your budgets."
          onRetry={() => {
            void error.refetch();
          }}
        />
      ) : budgets.isPending || categories.isPending ? (
        <LoadingBlock label="Loading budgets…" />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No budgets this month"
          text="Set how much you want to spend on a category and watch it fill up."
          actionLabel="Set a budget"
          onAction={() => {
            setEditing('new');
          }}
        />
      ) : (
        <ul aria-label="Budgets" className="flex flex-col gap-3">
          {items.map((budget) => {
            const category = byId.get(budget.categoryId);
            const name = category?.name ?? 'Category';
            const over = budget.spentPaise > budget.amountPaise;
            const text = `${formatInr(budget.spentPaise)} of ${formatInr(budget.amountPaise)}`;
            return (
              <li key={budget.id}>
                <GlassCard className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-card font-medium text-fg">
                      {category ? <ColorDot color={category.color} /> : null}
                      {name}
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={`text-body tabular-nums ${over ? 'text-danger' : 'text-fg-secondary'}`}
                      >
                        {text} · {String(budget.percent)}%
                      </span>
                      <Button
                        variant="secondary"
                        aria-label={`Edit budget ${name}`}
                        onClick={() => {
                          setEditing(budget);
                        }}
                      >
                        Edit
                      </Button>
                    </span>
                  </div>
                  <MoneyBar
                    value={budget.percent}
                    label={`${name} budget`}
                    valueText={`${text}, ${String(budget.percent)}%`}
                    over={over}
                  />
                  {over ? (
                    <p className="text-small text-danger">
                      Over budget by {formatInr(budget.spentPaise - budget.amountPaise)}
                    </p>
                  ) : null}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <BudgetDialog
          month={month}
          budget={editing === 'new' ? undefined : editing}
          categories={editing === 'new' ? free : expense}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
