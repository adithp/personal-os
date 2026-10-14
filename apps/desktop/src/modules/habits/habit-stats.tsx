import type { Habit, HabitRange } from '@personal-os/shared';
import { Button, SegmentedControl } from '@personal-os/ui';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { ApiError } from '../../api/api-client';
import { RANGE_OPTIONS, barsOf, habitColor, percentText, type Bar as BarData } from './format';
import { useHabitStats } from './habits-queries';

const CHART_HEIGHT = 160;

function BarTooltip({ active, payload }: TooltipContentProps) {
  const bar = payload.at(0)?.payload as BarData | undefined;
  if (!active || !bar) return null;
  return (
    <div
      data-liquid-skip
      className="rounded-chip glass-strong px-2 py-1.5 text-small whitespace-nowrap"
    >
      <p className="font-semibold text-fg">{bar.title}</p>
      <p className="text-fg-secondary">{String(bar.value)}</p>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col rounded-control bg-input p-2">
      <span className="text-small text-fg-muted">{label}</span>
      <span className="text-section font-semibold text-fg">{value}</span>
    </div>
  );
}

/** Completion rate, done / scheduled, total done, and a bar chart for a week, month or year. */
export function HabitStatsSection({ habit }: { habit: Habit }) {
  const [range, setRange] = useState<HabitRange>('week');
  const stats = useHabitStats(habit.id, range, habit.today.date);
  const data = stats.data ? barsOf(stats.data.days, range) : [];
  const empty = data.every((bar) => bar.value === 0);
  const word = range === 'year' ? 'month' : 'day';

  return (
    <section aria-label="Statistics" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-card font-medium text-fg">Statistics</h3>
        <SegmentedControl
          label="Statistics range"
          value={range}
          options={RANGE_OPTIONS}
          onChange={setRange}
        />
      </div>

      {stats.isError ? (
        <div role="alert" className="flex items-center justify-between gap-2">
          <p className="text-small text-danger">
            {stats.error instanceof ApiError
              ? stats.error.message
              : 'Could not load the statistics.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void stats.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {stats.isPending ? (
        <p role="status" className="text-small text-fg-muted">
          Loading statistics…
        </p>
      ) : null}

      {stats.isSuccess ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Completion" value={percentText(stats.data.rate)} />
            <StatBox
              label="Done / scheduled"
              value={`${String(stats.data.doneCount)} / ${String(stats.data.scheduledCount)}`}
            />
            <StatBox label="Total done" value={String(stats.data.totalDone)} />
          </div>
          <div
            role="group"
            aria-label={`Done per ${word}: ${String(stats.data.doneCount)} of ${String(stats.data.scheduledCount)} scheduled days`}
            className="relative"
          >
            <BarChart
              responsive
              width="100%"
              height={CHART_HEIGHT}
              data={data}
              accessibilityLayer
              margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
              barCategoryGap="20%"
              maxBarSize={20}
            >
              {empty ? null : <CartesianGrid vertical={false} stroke="var(--glass-border)" />}
              <XAxis
                dataKey="key"
                interval={range === 'month' ? 2 : 0}
                tickLine={false}
                axisLine={{ stroke: 'var(--glass-border)' }}
                tickFormatter={(key: string) => data.find((bar) => bar.key === key)?.label ?? ''}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
              <YAxis
                hide={empty}
                width={24}
                allowDecimals={false}
                tickCount={4}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
              {empty ? null : (
                <Tooltip
                  content={BarTooltip}
                  cursor={{ fill: 'var(--input-bg)' }}
                  isAnimationActive="auto"
                />
              )}
              <Bar
                dataKey="value"
                name="Done"
                fill={habitColor(habit)}
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
                isAnimationActive="auto"
              />
            </BarChart>
            {empty ? (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-body text-fg-muted">
                Nothing done in this {range} yet
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
