import { HABIT_WEEKDAY_NAMES, rangeBounds, type Habit, type HabitDay } from '@personal-os/shared';
import { Button, IconButton, cx } from '@personal-os/ui';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { ApiError } from '../../api/api-client';
import {
  cellLabel,
  cellState,
  habitColor,
  leadingBlanks,
  monthText,
  nextMonth,
  previousMonth,
  type CellState,
} from './format';
import { useHabitStats } from './habits-queries';

const CELL_CLASS: Record<CellState, string> = {
  done: 'text-on-tile',
  missed: 'border-danger text-fg',
  open: 'border-fg-muted text-fg',
  off: 'bg-input text-fg-muted',
  future: 'border-dashed border-glass-border text-fg-muted',
};

export interface HistoryCalendarProps {
  habit: Habit;
  /** A click on a day that is done (remove the check-in) or open (mark it done). */
  onToggleDay: (day: HabitDay) => void;
}

/** A month grid: done, missed, not scheduled and future days. Click a past day to toggle it. */
export function HistoryCalendar({ habit, onToggleDay }: HistoryCalendarProps) {
  const today = habit.today.date;
  const [month, setMonth] = useState(() => rangeBounds('month', today).from);
  const stats = useHabitStats(habit.id, 'month', month);
  const days = stats.data?.days ?? [];
  const isCurrentMonth = rangeBounds('month', today).from === month;
  const isFirstMonth = rangeBounds('month', habit.startDate).from >= month;
  const color = habitColor(habit);

  return (
    <section aria-label="History" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-card font-medium text-fg">History</h3>
        <div className="flex items-center gap-1">
          <IconButton
            aria-label="Previous month"
            disabled={isFirstMonth}
            icon={<IconChevronLeft size={16} aria-hidden />}
            onClick={() => {
              setMonth(previousMonth(month));
            }}
          />
          <span aria-live="polite" className="min-w-28 text-center text-body text-fg">
            {monthText(month)}
          </span>
          <IconButton
            aria-label="Next month"
            disabled={isCurrentMonth}
            icon={<IconChevronRight size={16} aria-hidden />}
            onClick={() => {
              setMonth(nextMonth(month));
            }}
          />
        </div>
      </div>

      {stats.isError ? (
        <div role="alert" className="flex items-center justify-between gap-2">
          <p className="text-small text-danger">
            {stats.error instanceof ApiError ? stats.error.message : 'Could not load the history.'}
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
          Loading history…
        </p>
      ) : null}

      {stats.isSuccess ? (
        <div role="group" aria-label={`${monthText(month)} history`}>
          <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
            {HABIT_WEEKDAY_NAMES.map((name) => (
              <span key={name} className="text-center text-small text-fg-muted">
                {name.slice(0, 2)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks(days[0]?.date ?? month) }, (_, index) => (
              <span key={`blank-${String(index)}`} aria-hidden />
            ))}
            {days.map((day) => {
              const state = cellState(day, today);
              const editable = state !== 'future' && (day.scheduled || day.done);
              return (
                <button
                  key={day.date}
                  type="button"
                  data-state={state}
                  disabled={!editable}
                  aria-label={cellLabel(day, state)}
                  onClick={() => {
                    onToggleDay(day);
                  }}
                  className={cx(
                    'flex aspect-square min-h-7 items-center justify-center rounded-control border-[1.5px] border-transparent text-small focus-ring transition-colors duration-150 ease-out',
                    CELL_CLASS[state],
                    day.date === today && 'font-semibold underline underline-offset-2',
                    editable && 'hover:brightness-110',
                    !editable && 'cursor-default',
                  )}
                  style={state === 'done' ? { backgroundColor: color } : undefined}
                >
                  {Number(day.date.slice(8))}
                </button>
              );
            })}
          </div>
          <ul aria-label="Legend" className="mt-2 flex flex-wrap gap-3 text-small text-fg-muted">
            <li className="flex items-center gap-1">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              Done
            </li>
            <li className="flex items-center gap-1">
              <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-danger" />
              Missed
            </li>
            <li className="flex items-center gap-1">
              <span aria-hidden className="size-2.5 rounded-full bg-input" />
              Not scheduled
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
