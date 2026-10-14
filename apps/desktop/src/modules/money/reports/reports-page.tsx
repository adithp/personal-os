import { formatInr } from '@personal-os/shared';
import { Tile } from '@personal-os/ui';
import { changeText } from '../money-format';
import { useCategories, useSummary } from '../money-queries';
import { useMoneyKeys } from '../shell/use-money-keys';
import { EmptyBlock, ErrorBlock, LoadingBlock, MonthSwitcher, PageHeader } from '../ui/page-parts';
import { useMoneyNav } from '../use-money-nav';
import { CategoryCard } from './category-card';
import { DayChartCard } from './day-chart-card';

/** Reports: income, expense and net of a month, spending by day and by category. */
export function ReportsPage() {
  const nav = useMoneyNav();
  const { month } = nav;
  const summary = useSummary(month);
  const categories = useCategories();
  useMoneyKeys({ months: true });
  const data = summary.data;
  const empty = data !== undefined && data.incomePaise === 0 && data.expensePaise === 0;

  return (
    <div className="flex w-full flex-col gap-4 px-2 pb-6">
      <PageHeader title="Reports">
        <MonthSwitcher month={month} onStep={nav.stepMonth} />
      </PageHeader>

      {summary.isError ? (
        <ErrorBlock
          error={summary.error}
          fallback="Could not load the report."
          onRetry={() => {
            void summary.refetch();
          }}
        />
      ) : !data ? (
        <LoadingBlock label="Loading report…" />
      ) : empty ? (
        <EmptyBlock
          title="Nothing to report"
          text="Add some transactions in this month and the numbers show up here."
          actionLabel="Go to Transactions"
          onAction={() => {
            nav.showSection('transactions');
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile module="money" title="Income" value={formatInr(data.incomePaise)} />
            <Tile
              module="money"
              title="Expense"
              value={formatInr(data.expensePaise)}
              lines={[changeText(data.expensePaise, data.previousExpensePaise) ?? 'No last month to compare']}
            />
            <Tile
              module="money"
              title="Net"
              value={`${data.netPaise < 0 ? '-' : ''}${formatInr(Math.abs(data.netPaise))}`}
              lines={[data.netPaise >= 0 ? 'Saved this month' : 'Spent more than earned']}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <DayChartCard summary={data} />
            <CategoryCard summary={data} categories={categories.data ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
