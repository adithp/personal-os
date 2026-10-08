import { GlassCard, IconButton, cx } from '@personal-os/ui';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  WEEKDAYS_MONDAY_FIRST,
  addMonths,
  dayKey,
  daysInMonth,
  leadingBlanks,
  monthLabel,
  todayInIndia,
  type CalendarDay,
} from './calendar-grid';

export interface MiniCalendarProps {
  /** The current moment; today is worked out in India time. */
  now: Date;
  /** Days that have events (a small orange dot is shown under them). */
  eventDays: readonly CalendarDay[];
}

const MONTH_NAMES_LONG = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long' });

/** Month view: today in lavender, an orange dot under days with events. A day opens Calendar. */
export function MiniCalendar({ now, eventDays }: MiniCalendarProps) {
  const navigate = useNavigate();
  const today = todayInIndia(now);
  const [shown, setShown] = useState({ year: today.year, month: today.month });

  const eventKeys = new Set(eventDays.map(dayKey));
  const blanks = leadingBlanks(shown.year, shown.month);
  const days = daysInMonth(shown.year, shown.month);
  const monthName = MONTH_NAMES_LONG.format(new Date(Date.UTC(shown.year, shown.month, 1)));

  const move = (delta: number) => {
    setShown((current) => addMonths(current.year, current.month, delta));
  };

  return (
    <GlassCard padding="compact" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-card font-semibold text-fg" aria-live="polite">
          {monthLabel(shown.year, shown.month)}
        </h2>
        <div className="flex gap-1">
          <IconButton
            aria-label="Previous month"
            className="size-6"
            icon={<IconChevronLeft size={14} aria-hidden />}
            onClick={() => {
              move(-1);
            }}
          />
          <IconButton
            aria-label="Next month"
            className="size-6"
            icon={<IconChevronRight size={14} aria-hidden />}
            onClick={() => {
              move(1);
            }}
          />
        </div>
      </div>

      <div
        role="grid"
        aria-label={monthLabel(shown.year, shown.month)}
        className="grid grid-cols-7"
      >
        {WEEKDAYS_MONDAY_FIRST.map((weekday, index) => (
          <span
            key={index}
            role="columnheader"
            className="py-1 text-center text-small text-fg-muted"
          >
            {weekday}
          </span>
        ))}

        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${String(index)}`} role="gridcell" aria-hidden />
        ))}

        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const cell: CalendarDay = { year: shown.year, month: shown.month, day };
          const isToday = dayKey(cell) === dayKey(today);
          const hasEvents = eventKeys.has(dayKey(cell));
          return (
            <span key={day} role="gridcell" className="flex justify-center">
              <button
                type="button"
                aria-label={`${String(day)} ${monthName} ${String(shown.year)}${hasEvents ? ', has events' : ''}`}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => {
                  void navigate({ to: '/calendar' });
                }}
                className={cx(
                  'relative flex size-8 items-center justify-center rounded-full text-small tabular-nums focus-ring',
                  isToday
                    ? 'bg-accent font-semibold text-on-tile'
                    : 'text-fg-secondary hover:bg-input hover:text-fg',
                )}
              >
                {day}
                {hasEvents && (
                  <span
                    data-testid="event-dot"
                    aria-hidden
                    className="absolute bottom-0.5 size-1 rounded-full bg-module-calendar"
                  />
                )}
              </button>
            </span>
          );
        })}
      </div>
    </GlassCard>
  );
}
