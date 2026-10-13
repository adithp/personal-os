import { canMarkAchieved, goalPercent, type Goal } from '@personal-os/shared';
import { Button, GlassCard, ProgressBar } from '@personal-os/ui';
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { useGoalPrompts } from '../prompt-store';
import { shortDate } from './goal-dates';

/** "3 of 8" with the percent and a bar; "No tasks yet" when nothing is linked; a quiet line when closed. */
export function GoalProgressCard({ goal, now }: { goal: Goal; now: Date }) {
  const { done, total } = goal.progress;
  const percent = goalPercent(goal.progress);
  const closedAt = goal.closedAt ? shortDate(goal.closedAt, now) : null;
  return (
    <GlassCard aria-label="Progress" role="region" className="flex flex-col gap-3">
      {percent === null ? (
        <div className="flex flex-col gap-1">
          <p className="text-section font-medium text-fg">No tasks yet</p>
          <p className="text-small text-fg-muted">Link tasks to see your progress.</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-big font-semibold text-fg">{`${String(done)} of ${String(total)}`}</span>
            <span className="text-small text-fg-muted">tasks done</span>
            <span className="ml-auto text-small text-fg-muted">{`${String(percent)}%`}</span>
          </div>
          <ProgressBar tone="glass" value={percent} label="Tasks done" />
        </>
      )}
      {goal.status !== 'active' && closedAt ? (
        <p className="flex items-center gap-1.5 text-small text-fg-muted">
          {goal.status === 'achieved' ? (
            <IconCircleCheck size={13} stroke={1.5} aria-hidden />
          ) : (
            <IconCircleX size={13} stroke={1.5} aria-hidden />
          )}
          {`${goal.status === 'achieved' ? 'Achieved' : 'Dropped'} ${closedAt}`}
        </p>
      ) : null}
    </GlassCard>
  );
}

/** "All 8 tasks are done. Mark this goal as achieved?" Not a dialog and without animation. */
export function AchievePrompt({ goal, onAchieve }: { goal: Goal; onAchieve: () => void }) {
  const total = goal.progress.total;
  const dismissed = useGoalPrompts((state) => state.dismissed[goal.id] === total);
  if (!canMarkAchieved(goal) || dismissed) return null;
  return (
    <GlassCard
      role="region"
      aria-label="Goal finished"
      padding="none"
      className="flex items-center gap-3 px-4 py-3"
    >
      <IconCircleCheck size={20} stroke={1.5} className="shrink-0 text-module-tasks" aria-hidden />
      <p className="flex-1 text-body text-fg">
        {`All ${String(total)} tasks are done. Mark this goal as achieved?`}
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          useGoalPrompts.getState().dismiss(goal.id, total);
        }}
      >
        Not yet
      </Button>
      <Button onClick={onAchieve}>Mark as achieved</Button>
    </GlassCard>
  );
}
