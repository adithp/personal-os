import { formatInr, type SavingsGoal } from '@personal-os/shared';
import { Button, GlassCard } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { shortDay } from '../money-format';
import { useGoals } from '../money-queries';
import { useMoneyKeys } from '../shell/use-money-keys';
import { ColorDot } from '../ui/fields';
import { MoneyBar } from '../ui/money-bar';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '../ui/page-parts';
import { GoalDialog } from './goal-dialog';
import { GoalMoneyDialog } from './goal-money-dialog';

type Dialog =
  | { type: 'goal'; goal?: SavingsGoal }
  | { type: 'money'; goal: SavingsGoal; mode: 'add' | 'withdraw' }
  | null;

function GoalCard({
  goal,
  open,
}: {
  goal: SavingsGoal;
  open: (dialog: NonNullable<Dialog>) => void;
}) {
  const text = `${formatInr(goal.savedPaise)} of ${formatInr(goal.targetPaise)}`;
  return (
    <li>
      <GlassCard className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-card font-medium text-fg">
            <ColorDot color={goal.color} />
            {goal.name}
            {goal.achieved ? (
              <span className="rounded-chip bg-input px-1.5 text-small text-fg-secondary">
                Reached
              </span>
            ) : null}
          </span>
          <span className="text-body text-fg-secondary tabular-nums">
            {text} · {String(goal.percent)}%
          </span>
        </div>
        <MoneyBar
          value={goal.percent}
          label={`${goal.name} goal`}
          valueText={`${text}, ${String(goal.percent)}%`}
          color={goal.color}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-fg-muted">
            {goal.targetOn ? `Target ${shortDay(goal.targetOn)}` : 'No target date'}
          </span>
          <span className="flex gap-2">
            <Button
              variant="secondary"
              aria-label={`Add money to ${goal.name}`}
              onClick={() => {
                open({ type: 'money', goal, mode: 'add' });
              }}
            >
              Add money
            </Button>
            <Button
              variant="secondary"
              aria-label={`Take money out of ${goal.name}`}
              disabled={goal.savedPaise === 0}
              onClick={() => {
                open({ type: 'money', goal, mode: 'withdraw' });
              }}
            >
              Take out
            </Button>
            <Button
              variant="secondary"
              aria-label={`Edit goal ${goal.name}`}
              onClick={() => {
                open({ type: 'goal', goal });
              }}
            >
              Edit
            </Button>
          </span>
        </div>
      </GlassCard>
    </li>
  );
}

/** Savings goals: progress, add or take out money, create, edit, delete. */
export function GoalsPage() {
  const goals = useGoals();
  const [dialog, setDialog] = useState<Dialog>(null);
  useMoneyKeys({
    onNew: () => {
      setDialog({ type: 'goal' });
    },
  });
  const items = goals.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-2 pb-6">
      <PageHeader title="Goals">
        <Button
          onClick={() => {
            setDialog({ type: 'goal' });
          }}
        >
          <IconPlus size={16} stroke={1.5} aria-hidden />
          New goal
        </Button>
      </PageHeader>

      {goals.isError ? (
        <ErrorBlock
          error={goals.error}
          fallback="Could not load your goals."
          onRetry={() => {
            void goals.refetch();
          }}
        />
      ) : goals.isPending ? (
        <LoadingBlock label="Loading goals…" />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No goals yet"
          text="Set a target, like an emergency fund, and add money as you save."
          actionLabel="Add a goal"
          onAction={() => {
            setDialog({ type: 'goal' });
          }}
        />
      ) : (
        <ul aria-label="Goals" className="flex flex-col gap-3">
          {items.map((goal) => (
            <GoalCard key={goal.id} goal={goal} open={setDialog} />
          ))}
        </ul>
      )}

      {dialog?.type === 'goal' ? (
        <GoalDialog
          goal={dialog.goal}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.type === 'money' ? (
        <GoalMoneyDialog
          goal={dialog.goal}
          mode={dialog.mode}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
