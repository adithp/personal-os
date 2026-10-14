import { formatInr, percentOf, type Category, type MonthSummary } from '@personal-os/shared';
import { useState } from 'react';
import { ReportCard, ReportTable } from '../../tasks/reporting/report-card';
import { ColorDot } from '../ui/fields';

interface Row {
  key: string;
  name: string;
  color: string | null;
  totalPaise: number;
}

/** Expense rows of the summary, biggest first, named from the categories (null id: Uncategorised). */
function categoryRows(summary: MonthSummary, categories: readonly Category[]): Row[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return summary.byCategory
    .filter((row) => row.kind === 'expense' && row.totalPaise > 0)
    .map((row) => {
      const category = row.categoryId ? byId.get(row.categoryId) : undefined;
      return {
        key: row.categoryId ?? 'none',
        name: category?.name ?? 'Uncategorised',
        color: category?.color ?? null,
        totalPaise: row.totalPaise,
      };
    })
    .sort((a, b) => b.totalPaise - a.totalPaise);
}

/** Spending by category: one horizontal bar each in the category color, with a table toggle. */
export function CategoryCard({
  summary,
  categories,
}: {
  summary: MonthSummary;
  categories: readonly Category[];
}) {
  const [table, setTable] = useState(false);
  const rows = categoryRows(summary, categories);
  const max = Math.max(1, ...rows.map((row) => row.totalPaise));

  return (
    <ReportCard
      title="Spending by category"
      subtitle={`${formatInr(summary.expensePaise)} in total`}
      table={table}
      onToggleTable={() => {
        setTable((value) => !value);
      }}
    >
      {table ? (
        <ReportTable
          label="Spending by category"
          head={['Category', 'Spent', 'Share']}
          rows={rows.map((row) => [
            row.name,
            formatInr(row.totalPaise),
            `${String(percentOf(row.totalPaise, summary.expensePaise))}%`,
          ])}
        />
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-body text-fg-muted">
          Nothing spent this month yet
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 overflow-y-auto pt-1">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,96px)_1fr_64px] items-center gap-2 text-body"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-fg">
                {row.color ? <ColorDot color={row.color} /> : null}
                <span className="truncate" title={row.name}>
                  {row.name}
                </span>
              </span>
              <span aria-hidden className="h-3">
                <span
                  className="block h-3 rounded-r-[4px] bg-module-money"
                  style={{ width: `${String((row.totalPaise / max) * 100)}%` }}
                />
              </span>
              <span className="text-right text-small text-fg-secondary">
                {formatInr(row.totalPaise)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  );
}
