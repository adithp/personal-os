import { canMarkAchieved, goalPercent, type Goal } from '@personal-os/shared';
import { ProgressBar } from '@personal-os/ui';
import {
  IconCalendar,
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconTarget,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useGoalPrompts } from '../prompt-store';
import { closedLine, goalKey, progressText, targetLine } from './goal-format';

export interface GoalCardProps {
  goal: Goal;
  now: Date;
  /** Roving Tab stop: only one card in the grid can be reached with Tab. */
  tabbable: boolean;
  onFocusCard: (key: string) => void;
  onAchieve: (goal: Goal) => void;
}

/**
 * One goal as a glass card. The title is the link and is stretched over the whole card; the
 * "Mark as achieved" button sits above that layer, so no button is nested inside the anchor.
 */
export function GoalCard({ goal, now, tabbable, onFocusCard, onAchieve }: GoalCardProps) {
  const { progress } = goal;
  const percent = goalPercent(progress);
  const dismissed = useGoalPrompts((state) => state.isDismissed(goal.id, progress.total));
  const offerAchieve = canMarkAchieved(goal) && !dismissed;
  const target = targetLine(goal, now);
  const key = goalKey(goal);

  return (
    <li className="relative flex flex-col gap-3 rounded-card glass p-4 transition-transform duration-150 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-module-tasks text-on-tile"
        >
          <IconTarget size={16} stroke={1.5} />
        </span>
        <Link
          to="/tasks/goals/$goalId"
          params={{ goalId: goal.id }}
          title={goal.title}
          data-item-key={key}
          tabIndex={tabbable ? 0 : -1}
          onFocus={() => {
            onFocusCard(key);
          }}
          className="line-clamp-2 min-w-0 flex-1 text-body font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
        >
          {goal.title}
        </Link>
      </div>

      {percent === null ? (
        <p className="text-small text-fg-secondary">No tasks yet</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <ProgressBar
            tone="glass"
            value={percent}
            label={`Tasks done: ${String(progress.done)} of ${String(progress.total)}`}
            valueText={progressText(progress)}
          />
          <div className="flex items-center justify-between text-small text-fg-secondary">
            <span>{progressText(progress)}</span>
            <span>{String(percent)}%</span>
          </div>
        </div>
      )}

      {offerAchieve ? (
        <p className="flex items-center gap-1.5 text-small text-fg-secondary">
          <IconCheck size={14} stroke={1.5} aria-hidden />
          <span>All tasks done</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            aria-label={`Mark as achieved: ${goal.title}`}
            onClick={() => {
              onAchieve(goal);
            }}
            className="relative z-10 rounded-chip font-medium text-fg underline-offset-2 focus-ring hover:underline"
          >
            Mark as achieved
          </button>
        </p>
      ) : null}

      {goal.status === 'active' ? (
        <p
          className={
            target.passed
              ? 'flex items-center gap-1.5 text-small text-danger'
              : 'flex items-center gap-1.5 text-small text-fg-secondary'
          }
        >
          {goal.targetAt ? <IconCalendar size={14} stroke={1.5} aria-hidden /> : null}
          {target.text}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-small text-fg-secondary">
          {goal.status === 'dropped' ? (
            <IconCircleX size={14} stroke={1.5} aria-hidden />
          ) : (
            <IconCircleCheck size={14} stroke={1.5} aria-hidden />
          )}
          {closedLine(goal, now)}
        </p>
      )}
    </li>
  );
}
