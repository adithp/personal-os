import type { Habit, HabitDay } from '@personal-os/shared';
import { GlassCard, IconButton } from '@personal-os/ui';
import { IconFlame, IconPencil, IconX } from '@tabler/icons-react';
import type { KeyboardEvent } from 'react';
import { daysText, habitColor, scheduleLabel } from './format';
import { HabitStatsSection } from './habit-stats';
import { HistoryCalendar } from './history-calendar';

export interface HabitDetailPanelProps {
  habit: Habit;
  onClose: () => void;
  onEdit: (habit: Habit) => void;
  onToggleDay: (habit: Habit, day: HabitDay) => void;
}

function StreakBox({ label, days, color }: { label: string; days: number; color?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col rounded-control bg-input p-2">
      <span className="text-small text-fg-muted">{label}</span>
      <span className="flex items-center gap-1 text-section font-semibold text-fg">
        <IconFlame size={16} stroke={1.5} aria-hidden style={color ? { color } : undefined} />
        {daysText(days)}
      </span>
    </div>
  );
}

/** The right panel of a habit: streaks, history calendar, statistics and notes. */
export function HabitDetailPanel({ habit, onClose, onEdit, onToggleDay }: HabitDetailPanelProps) {
  const color = habitColor(habit);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onClose();
  };

  return (
    <GlassCard
      role="complementary"
      aria-label="Habit details"
      onKeyDown={onKeyDown}
      className="flex max-h-full min-h-0 w-[360px] shrink-0 flex-col gap-4 self-start overflow-y-auto"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1.5 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-section font-semibold text-fg">{habit.name}</h2>
          <p className="text-small text-fg-muted">
            {[
              habit.category,
              scheduleLabel(habit.schedule),
              habit.target > 1 ? `${String(habit.target)} a day` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <IconButton
          aria-label="Edit habit"
          icon={<IconPencil size={16} aria-hidden />}
          onClick={() => {
            onEdit(habit);
          }}
        />
        <IconButton
          aria-label="Close details"
          icon={<IconX size={16} aria-hidden />}
          onClick={onClose}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StreakBox label="Current streak" days={habit.currentStreak} color={color} />
        <StreakBox label="Best streak" days={habit.bestStreak} />
      </div>

      <HistoryCalendar
        key={habit.id}
        habit={habit}
        onToggleDay={(day) => {
          onToggleDay(habit, day);
        }}
      />

      <HabitStatsSection key={`stats-${habit.id}`} habit={habit} />

      <section aria-label="Notes" className="flex flex-col gap-1">
        <h3 className="text-card font-medium text-fg">Notes</h3>
        {habit.notes.trim() === '' ? (
          <p className="text-body text-fg-muted">No notes. Add some with Edit.</p>
        ) : (
          <p className="text-body whitespace-pre-wrap text-fg-secondary">{habit.notes}</p>
        )}
      </section>
    </GlassCard>
  );
}
