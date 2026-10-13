import type { ReportPeriod, TaskReport } from '@personal-os/shared';
import { Button, GlassCard, SegmentedControl, cx } from '@personal-os/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { DoneByTagCard } from './done-by-tag-card';
import { DonePerDayCard } from './done-per-day-card';
import { periodLabel } from './report-format';
import { StatCards, StatCardsLoading } from './stat-cards';
import { useReport } from './use-report';

const PERIODS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
] as const;

/** True when nothing was ever finished: both periods and every day are zero. */
function neverDone(report: TaskReport): boolean {
  return (
    report.totals.done === 0 &&
    report.previous.done === 0 &&
    report.days.every((day) => day.done === 0)
  );
}

function ChartsLoading() {
  return (
    <div className="grid grid-cols-3 gap-3" aria-hidden>
      {[2, 1].map((span) => (
        <GlassCard
          key={span}
          className={cx('flex min-h-[270px] flex-col gap-2', span === 2 && 'col-span-2')}
        >
          <span className="h-3.5 w-24 rounded-chip bg-input" />
          <span className="h-2.5 w-36 rounded-chip bg-input" />
          <span className="mt-2 w-full flex-1 rounded-chip bg-input" />
        </GlassCard>
      ))}
    </div>
  );
}

/** Reporting: four numbers and two charts for this week or this month (research memo D1 to D16). */
export function ReportingPage() {
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const navigate = useNavigate();
  const query = useReport(period);
  const report = query.data;
  // The picture of the other period (or an older fetch) stays on screen at half opacity
  const refreshing = report !== undefined && (query.isPlaceholderData || query.isFetching);

  return (
    <div className="flex w-full flex-col gap-3 px-2 pb-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-page font-semibold text-fg">Reporting</h1>
          <p className="min-h-[15px] text-small text-fg-muted">
            {report ? periodLabel(report) : ' '}
          </p>
        </div>
        <SegmentedControl
          label="Report period"
          value={period}
          options={PERIODS}
          onChange={setPeriod}
        />
      </div>

      {query.isError && !report ? (
        <GlassCard role="alert" className="flex items-center justify-between gap-4">
          <p className="text-body text-fg">
            {query.error instanceof ApiError ? query.error.message : 'Could not load the report.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </Button>
        </GlassCard>
      ) : !report ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <StatCardsLoading />
          <ChartsLoading />
        </div>
      ) : neverDone(report) ? (
        <GlassCard className="mx-auto mt-8 flex max-w-[420px] flex-col items-center gap-2 py-8 text-center">
          <h2 className="text-section font-semibold text-fg">No finished tasks yet</h2>
          <p className="text-body text-fg-secondary">
            Complete a few tasks and your week will show up here.
          </p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => {
              void navigate({ to: '/tasks/my-tasks' });
            }}
          >
            Go to My tasks
          </Button>
        </GlassCard>
      ) : (
        <div
          aria-busy={refreshing}
          className={cx(
            'flex flex-col gap-3 transition-opacity duration-150 ease-out',
            refreshing && 'opacity-50',
          )}
        >
          <StatCards report={report} />
          <div className="grid grid-cols-3 gap-3">
            <DonePerDayCard report={report} />
            <DoneByTagCard report={report} />
          </div>
        </div>
      )}
    </div>
  );
}
