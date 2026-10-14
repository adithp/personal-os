import { addDays, formatInr, monthEnd, monthStart, type MonthSummary } from '@personal-os/shared';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { ReportCard, ReportTable } from '../../tasks/reporting/report-card';
import { monthLabel, shortDay } from '../money-format';

const CHART_HEIGHT = 200;

interface DayPoint {
  date: string;
  /** Day of the month, for the axis. */
  label: string;
  expensePaise: number;
}

/** Every day of the month, with 0 for the days that have no expense. */
export function daysOf(summary: MonthSummary): DayPoint[] {
  const spent = new Map(summary.byDay.map((day) => [day.date, day.expensePaise]));
  const end = monthEnd(summary.month);
  const points: DayPoint[] = [];
  for (let day = monthStart(summary.month); day < end; day = addDays(day, 1)) {
    points.push({
      date: day,
      label: String(Number(day.slice(8, 10))),
      expensePaise: spent.get(day) ?? 0,
    });
  }
  return points;
}

function DayTooltip({ active, payload }: TooltipContentProps) {
  const point = payload.at(0)?.payload as DayPoint | undefined;
  if (!active || !point) return null;
  return (
    <div
      data-liquid-skip
      className="rounded-chip glass-strong px-2 py-1.5 text-small whitespace-nowrap"
    >
      <p className="font-semibold text-fg">{shortDay(point.date)}</p>
      <p className="text-fg-secondary">{formatInr(point.expensePaise)} spent</p>
    </div>
  );
}

/** Spending per day of the month: mint columns, with a table for screen readers. */
export function DayChartCard({ summary }: { summary: MonthSummary }) {
  const [table, setTable] = useState(false);
  const data = daysOf(summary);
  const empty = summary.expensePaise === 0;

  return (
    <ReportCard
      title="Spending per day"
      subtitle={monthLabel(summary.month)}
      table={table}
      onToggleTable={() => {
        setTable((value) => !value);
      }}
      className="col-span-2"
    >
      {table ? (
        <ReportTable
          label="Spending per day"
          head={['Day', 'Spent']}
          rows={data
            .filter((d) => d.expensePaise > 0)
            .map((d) => [shortDay(d.date), formatInr(d.expensePaise)])}
        />
      ) : (
        <div
          role="group"
          aria-label={`${formatInr(summary.expensePaise)} spent in ${monthLabel(summary.month)}`}
          className="relative min-h-0 flex-1"
        >
          <BarChart
            responsive
            width="100%"
            height={CHART_HEIGHT}
            data={data}
            accessibilityLayer
            margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="20%"
            maxBarSize={16}
          >
            {empty ? null : <CartesianGrid vertical={false} stroke="var(--glass-border)" />}
            <XAxis
              dataKey="label"
              interval={2}
              tickLine={false}
              axisLine={{ stroke: 'var(--glass-border)' }}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
            <YAxis
              hide={empty}
              width={56}
              tickCount={4}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              tickFormatter={(value: number) => formatInr(value)}
            />
            {empty ? null : (
              <Tooltip
                content={DayTooltip}
                cursor={{ fill: 'var(--input-bg)' }}
                isAnimationActive="auto"
              />
            )}
            <Bar
              dataKey="expensePaise"
              name="Spent"
              fill="var(--module-money)"
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
              isAnimationActive="auto"
            />
          </BarChart>
          {empty ? (
            <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-body text-fg-muted">
              Nothing spent this month yet
            </p>
          ) : null}
        </div>
      )}
    </ReportCard>
  );
}
