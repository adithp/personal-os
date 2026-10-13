import type { TaskReport } from '@personal-os/shared';
import { GlassCard, cx } from '@personal-os/ui';
import { comparisonName, onTimePercent, periodWord } from './report-format';

interface StatProps {
  title: string;
  value: string;
  line: string;
  danger?: boolean;
  hint?: string;
}

function Stat({ title, value, line, danger = false, hint }: StatProps) {
  return (
    <GlassCard
      role="group"
      aria-label={title}
      title={hint}
      className="flex min-h-[104px] flex-col gap-1"
    >
      <p className="text-card text-fg-secondary">{title}</p>
      <p className={cx('text-big font-semibold', danger ? 'text-danger' : 'text-fg')}>{value}</p>
      <p className="mt-auto text-small text-fg-muted">{line}</p>
      {hint ? <span className="sr-only">{hint}</span> : null}
    </GlassCard>
  );
}

/** Placeholders at the final size, shown on the very first load (no spinner). */
export function StatCardsLoading() {
  return (
    <div className="grid grid-cols-4 gap-3" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <GlassCard key={index} className="flex min-h-[104px] flex-col gap-2">
          <span className="h-3 w-16 rounded-chip bg-input" />
          <span className="h-7 w-12 rounded-chip bg-input" />
          <span className="mt-auto h-2.5 w-28 rounded-chip bg-input" />
        </GlassCard>
      ))}
    </div>
  );
}

/** The four numbers: Done, On time, Overdue now, Added. */
export function StatCards({ report }: { report: TaskReport }) {
  const { totals, previous, period } = report;
  const word = periodWord(period);
  const name = comparisonName(report);
  const rate = onTimePercent(totals.onTime, totals.late);
  const previousRate = onTimePercent(previous.onTime, previous.late);

  const rateLine =
    rate === null
      ? `No due dates this ${word}`
      : `${String(totals.onTime)} of ${String(totals.onTime + totals.late)} with a due date · last ${word} ${previousRate === null ? '–' : `${String(previousRate)}%`}`;

  return (
    <div className="grid grid-cols-4 gap-3">
      <Stat title="Done" value={String(totals.done)} line={`${name}: ${String(previous.done)}`} />
      <Stat title="On time" value={rate === null ? '–' : `${String(rate)}%`} line={rateLine} />
      <Stat
        title="Overdue now"
        value={String(report.overdueNow)}
        line="right now"
        danger={report.overdueNow > 0}
      />
      <Stat
        title="Added"
        value={String(totals.added)}
        line={`${name}: ${String(previous.added)}`}
        hint="Includes the automatic next copy of a repeating task."
      />
    </div>
  );
}
