import type { GoalStatus } from '@personal-os/shared';
import { Button, GlassCard, SegmentedControl } from '@personal-os/ui';
import { IconPlus, IconTarget } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ApiError } from '../../../../api/api-client';
import { useNow } from '../../../dashboard/greeting';
import { useTaskShortcuts } from '../../my-tasks/use-task-shortcuts';
import { useGoalActions, useGoals } from '../goals-queries';
import { GoalCard } from './goal-card';
import { goalKey } from './goal-format';
import { GoalsHelp } from './goals-help';
import { NewGoalDialog } from './new-goal-dialog';

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'dropped', label: 'Dropped' },
] as const;

const EMPTY_TEXT: Record<GoalStatus, string> = {
  active: 'No active goals',
  achieved: 'No achieved goals yet',
  dropped: 'No dropped goals',
};

const nothing = () => undefined;

/** The goals list at /tasks/goals: a status switch, a grid of goal cards, and "New goal". */
export function GoalsListPage() {
  const now = useNow();
  const navigate = useNavigate();
  const [tab, setTab] = useState<GoalStatus>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tabKey, setTabKey] = useState<string | null>(null);
  const gridRoot = useRef<HTMLUListElement>(null);

  const shown = useGoals(tab);
  const all = useGoals();
  const { create, setStatus } = useGoalActions();

  const goals = shown.data ?? [];
  const keys = goals.map(goalKey);
  const tabbableKey = tabKey !== null && keys.includes(tabKey) ? tabKey : (keys[0] ?? null);
  const activeCount = all.data?.filter((goal) => goal.status === 'active').length ?? 0;
  const neverHadGoal = all.data?.length === 0;

  useTaskShortcuts({
    rootRef: gridRoot,
    grid: true,
    getTask: nothing,
    focusAdd: () => {
      setDialogOpen(true);
    },
    onToggle: nothing,
    onOpen: nothing,
    onDelete: nothing,
    onEscape: nothing,
    onHelp: () => {
      setHelpOpen(true);
    },
  });

  const openDialog = () => {
    setDialogOpen(true);
  };

  const createGoal = async (input: { title: string; targetAt?: string }) => {
    const { item } = await create.mutateAsync(input);
    setDialogOpen(false);
    void navigate({ to: '/tasks/goals/$goalId', params: { goalId: item.id } });
  };

  const newGoalButton = (
    <Button variant="secondary" onClick={openDialog}>
      <IconPlus size={16} stroke={1.5} aria-hidden />
      New goal
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-8 pt-4 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page font-semibold text-fg">Goals</h1>
          <p className="min-h-[15px] text-small text-fg-muted">
            {all.data && !neverHadGoal ? `${String(activeCount)} active` : ' '}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl label="Goal status" value={tab} options={TABS} onChange={setTab} />
          {newGoalButton}
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => {
              setHelpOpen(true);
            }}
            className="h-[30px] min-h-6 min-w-6 rounded-control px-2 text-body text-fg-muted focus-ring hover:bg-input hover:text-fg"
          >
            ?
          </button>
        </div>
      </header>

      {shown.isError ? (
        <GlassCard role="alert" className="flex items-center justify-between gap-4">
          <p className="text-body text-fg">
            {shown.error instanceof ApiError ? shown.error.message : 'Could not load your goals.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void shown.refetch();
            }}
          >
            Try again
          </Button>
        </GlassCard>
      ) : null}

      {shown.isPending ? (
        <p role="status" className="px-1 text-body text-fg-muted">
          Loading goals…
        </p>
      ) : null}

      {shown.isSuccess && goals.length === 0 ? (
        neverHadGoal ? (
          <GlassCard className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-input text-fg-muted">
              <IconTarget size={20} stroke={1.5} aria-hidden />
            </span>
            <h2 className="text-section font-medium text-fg">No goals yet</h2>
            <p className="text-body text-fg-muted">
              A goal groups the tasks that move you toward something bigger.
            </p>
            {newGoalButton}
          </GlassCard>
        ) : (
          <p role="status" className="px-1 text-body text-fg-muted">
            {EMPTY_TEXT[tab]}
          </p>
        )
      ) : null}

      {goals.length > 0 ? (
        <ul
          ref={gridRoot}
          aria-label={`${TABS.find((option) => option.value === tab)?.label ?? ''} goals`}
          className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4"
        >
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              now={now}
              tabbable={tabbableKey === goalKey(goal)}
              onFocusCard={setTabKey}
              onAchieve={(target) => {
                setStatus.mutate({ id: target.id, status: 'achieved' });
              }}
            />
          ))}
        </ul>
      ) : null}

      {dialogOpen ? (
        <NewGoalDialog
          onCreate={createGoal}
          onClose={() => {
            setDialogOpen(false);
          }}
        />
      ) : null}
      {helpOpen ? (
        <GoalsHelp
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
