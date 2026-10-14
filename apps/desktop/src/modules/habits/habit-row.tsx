import type { Habit } from '@personal-os/shared';
import { IconButton, cx } from '@personal-os/ui';
import { IconCheck, IconFlame, IconMinus, IconPlus } from '@tabler/icons-react';
import { daysText, habitColor, progressLabel, scheduleLabel } from './format';

export interface HabitRowProps {
  habit: Habit;
  selected: boolean;
  /** Roving tab stop: only one row is in the Tab order. */
  tabbable: boolean;
  /** Not scheduled today: drawn muted, with no check. */
  muted?: boolean;
  onFocusRow: (id: string) => void;
  onOpen: (habit: Habit) => void;
  /** Click on the round check of a simple habit. */
  onToggle: (habit: Habit) => void;
  /** The + and - of a counter habit. */
  onStep: (habit: Habit, delta: 1 | -1) => void;
}

/** The streak flame and number. */
export function Streak({ habit }: { habit: Pick<Habit, 'currentStreak' | 'color'> }) {
  const on = habit.currentStreak > 0;
  return (
    <span
      role="img"
      aria-label={`Streak: ${daysText(habit.currentStreak)}`}
      className={cx(
        'inline-flex items-center gap-0.5 text-small',
        on ? 'font-medium text-fg' : 'text-fg-muted',
      )}
    >
      <IconFlame
        size={14}
        stroke={1.5}
        aria-hidden
        style={on ? { color: habitColor(habit) } : undefined}
      />
      {habit.currentStreak}
    </span>
  );
}

function SimpleCheck({ habit, onToggle }: Pick<HabitRowProps, 'habit' | 'onToggle'>) {
  const done = habit.today.done;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? 'Undo' : 'Done'}: ${habit.name}`}
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(habit);
      }}
      className={cx(
        'flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] focus-ring transition-colors duration-150 ease-out',
        done ? 'border-transparent text-on-tile' : 'border-fg-muted hover:border-fg',
      )}
      style={done ? { backgroundColor: habitColor(habit) } : undefined}
    >
      {done ? <IconCheck size={14} stroke={2.5} aria-hidden /> : null}
    </button>
  );
}

function Counter({ habit, onStep }: Pick<HabitRowProps, 'habit' | 'onStep'>) {
  const { count, done } = habit.today;
  return (
    <div
      role="group"
      aria-label={`${habit.name} count`}
      className="flex shrink-0 items-center gap-1"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <IconButton
        aria-label={`Remove one: ${habit.name}`}
        disabled={count === 0}
        icon={<IconMinus size={14} aria-hidden />}
        onClick={() => {
          onStep(habit, -1);
        }}
      />
      <span
        className={cx(
          'flex h-[30px] min-w-[52px] items-center justify-center gap-1 rounded-control px-2 text-body font-medium',
          done ? 'text-on-tile' : 'bg-input text-fg',
        )}
        style={done ? { backgroundColor: habitColor(habit) } : undefined}
      >
        {done ? <IconCheck size={12} stroke={2.5} aria-hidden /> : null}
        {progressLabel(habit)}
      </span>
      <IconButton
        aria-label={`Add one: ${habit.name}`}
        disabled={done}
        icon={<IconPlus size={14} aria-hidden />}
        onClick={() => {
          onStep(habit, 1);
        }}
      />
    </div>
  );
}

/** One habit: round check (or counter), name, schedule, at-risk badge and streak. Click opens it. */
export function HabitRow({
  habit,
  selected,
  tabbable,
  muted = false,
  onFocusRow,
  onOpen,
  onToggle,
  onStep,
}: HabitRowProps) {
  const counter = habit.target > 1;
  return (
    <li>
      <div
        role="group"
        aria-label={habit.name}
        data-item-key={habit.id}
        data-habit-id={habit.id}
        tabIndex={tabbable ? 0 : -1}
        onFocus={(event) => {
          if (event.target === event.currentTarget) onFocusRow(habit.id);
        }}
        onClick={() => {
          onOpen(habit);
        }}
        className={cx(
          'flex cursor-pointer items-center gap-3 rounded-card glass p-3 focus-ring transition-colors duration-150 ease-out hover:bg-input',
          selected && 'bg-input',
          muted && 'opacity-60',
        )}
      >
        {muted ? (
          <span
            aria-hidden
            className="size-[22px] shrink-0 rounded-full border-[1.5px] border-dashed border-fg-muted"
          />
        ) : counter ? (
          <span
            aria-hidden
            className="size-[22px] shrink-0 rounded-full border-[1.5px] border-fg-muted"
            style={habit.today.done ? { backgroundColor: habitColor(habit) } : undefined}
          />
        ) : (
          <SimpleCheck habit={habit} onToggle={onToggle} />
        )}

        <div className="min-w-0 flex-1">
          <p
            className={cx(
              'truncate text-body text-fg',
              habit.today.done && !muted && 'text-fg-secondary line-through',
            )}
          >
            {habit.name}
          </p>
          <p className="truncate text-small text-fg-muted">
            {[habit.category, scheduleLabel(habit.schedule)].filter(Boolean).join(' · ')}
          </p>
        </div>

        {habit.atRisk ? (
          <span className="shrink-0 rounded-chip border-[0.5px] border-danger px-1.5 py-0.5 text-small text-danger">
            At risk
          </span>
        ) : null}
        <Streak habit={habit} />
        {counter && !muted ? <Counter habit={habit} onStep={onStep} /> : null}
      </div>
    </li>
  );
}
