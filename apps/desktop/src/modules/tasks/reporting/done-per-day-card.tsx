import type { ReportDay, TaskReport } from '@personal-os/shared';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { ReportCard, ReportTable } from './report-card';
import { axisLabel, dayLabel, daySummary, dayTooltip, periodWord } from './report-format';

const CHART_HEIGHT = 200;

function DayTooltip({ active, payload }: TooltipContentProps) {
  const day = payload.at(0)?.payload as ReportDay | undefined;
  if (!active || !day) return null;
  const { title, detail } = dayTooltip(day);
  return (
    <div
      data-liquid-skip
      className="rounded-chip glass-strong px-2 py-1.5 text-small whitespace-nowrap"
    >
      <p className="font-semibold text-fg">{title}</p>
      <p className="text-fg-secondary">{detail}</p>
    </div>
  );
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string; index?: number };
}

/** Done per day: columns in Tasks yellow, one per India calendar day of the period. */
export function DonePerDayCard({ report }: { report: TaskReport }) {
  const [table, setTable] = useState(false);
  const { period, today, days } = report;
  const week = period === 'week';
  const empty = report.totals.done === 0;

  const data = days.map((day) => ({
    ...day,
    label: axisLabel(day.date, period),
  }));

  const tick = ({ x = 0, y = 0, payload }: TickProps) => {
    const item = payload?.index === undefined ? undefined : data[payload.index];
    const isToday = item?.date === today;
    return (
      <text
        x={x}
        y={y}
        dy={12}
        textAnchor="middle"
        fontSize={11}
        fontWeight={isToday ? 500 : 400}
        fill={isToday ? 'var(--text-primary)' : 'var(--text-secondary)'}
      >
        {item?.label}
      </text>
    );
  };

  return (
    <ReportCard
      title="Done per day"
      subtitle={week ? 'Monday to Sunday' : 'Every day of the month'}
      table={table}
      onToggleTable={() => {
        setTable((value) => !value);
      }}
      className="col-span-2"
    >
      {table ? (
        <ReportTable
          label="Done per day"
          head={['Day', 'Done', 'On time', 'Late']}
          rows={days.map((day) => [dayLabel(day.date), day.done, day.onTime, day.late])}
        />
      ) : (
        <div role="group" aria-label={daySummary(report)} className="relative min-h-0 flex-1">
          <BarChart
            responsive
            width="100%"
            height={CHART_HEIGHT}
            data={data}
            accessibilityLayer
            margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="20%"
            maxBarSize={24}
          >
            {empty ? null : <CartesianGrid vertical={false} stroke="var(--glass-border)" />}
            <XAxis
              dataKey="date"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: 'var(--glass-border)' }}
              tick={tick}
            />
            <YAxis
              hide={empty}
              width={28}
              allowDecimals={false}
              tickCount={4}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
            {empty ? null : (
              <Tooltip
                content={DayTooltip}
                cursor={{ fill: 'var(--input-bg)' }}
                isAnimationActive="auto"
              />
            )}
            <Bar
              dataKey="done"
              name="Done"
              fill="var(--module-tasks)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive="auto"
            >
              {week && !empty ? (
                <LabelList
                  dataKey="done"
                  position="top"
                  fontSize={11}
                  fill="var(--text-secondary)"
                  formatter={(value: unknown) =>
                    typeof value === 'number' && value > 0 ? value : ''
                  }
                />
              ) : null}
            </Bar>
          </BarChart>
          {empty ? (
            <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-body text-fg-muted">
              Nothing done this {periodWord(period)} yet
            </p>
          ) : null}
        </div>
      )}
    </ReportCard>
  );
}
