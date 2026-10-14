import type { Task } from '@personal-os/shared';
import { Button, GlassCard } from '@personal-os/ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../../api/api-client';
import { useNow } from '../../../dashboard/greeting';
import { TaskDetailPanel } from '../../detail/task-detail-panel';
import type { TaskItemContext } from '../../my-tasks/task-item';
import { useTaskShortcuts } from '../../my-tasks/use-task-shortcuts';
import { useTaskActions, useTasks } from '../../tasks-queries';
import { useTasksUi } from '../../tasks-ui-store';
import { useGoal, useGoalActions } from '../goals-queries';
import { GoalHeader } from './goal-header';
import { GoalNotes } from './goal-notes';
import { AchievePrompt, GoalProgressCard } from './goal-progress';
import { GoalShortcutsHelp } from './goal-shortcuts-help';
import { itemKeyOf, type GroupId } from './goal-task-keys';
import { GoalTasksCard } from './goal-tasks-card';

/** The goal page: header, progress, the "Mark as achieved?" prompt, notes, and the goal's tasks. */
export function GoalDetailPage({ goalId }: { goalId: string }) {
  const now = useNow();
  const navigate = useNavigate();
  const ui = useTasksUi();
  const { select } = ui;
  const goalQuery = useGoal(goalId);
  const tasksQuery = useTasks({ goalId });
  const { update, setStatus, remove, setTaskGoal } = useGoalActions();
  const taskActions = useTaskActions();

  const [helpOpen, setHelpOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<GroupId, boolean>>({
    done: false,
    archived: false,
  });
  const [tabKey, setTabKey] = useState<string | null>(null);
  const addBox = useRef<HTMLInputElement>(null);
  const listRoot = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ removed: string; next: string | null; at: number } | null>(null);

  // A task opened on another page must not pop open here
  useEffect(() => {
    select(null);
  }, [goalId, select]);

  const goal = goalQuery.data;
  const { open, done, archived } = useMemo(() => {
    const all = tasksQuery.data ?? [];
    return {
      done: all.filter((task) => task.status === 'done'),
      archived: all.filter((task) => task.status !== 'done' && task.archivedAt !== null),
      open: all.filter((task) => task.status !== 'done' && task.archivedAt === null),
    };
  }, [tasksQuery.data]);
  const byId = useMemo(
    () => new Map((tasksQuery.data ?? []).map((task) => [task.id, task])),
    [tasksQuery.data],
  );

  // Rows that can be reached now: open ones, plus the groups that are expanded
  const visible = [...open, ...(expanded.done ? done : []), ...(expanded.archived ? archived : [])];
  const keys = visible.map(itemKeyOf);
  const tabbableKey = tabKey !== null && keys.includes(tabKey) ? tabKey : (keys[0] ?? null);

  // After a task leaves the list (done, or taken out), focus the row that took its place
  const keepPlace = (task: Task) => {
    const rows = [...(listRoot.current?.querySelectorAll<HTMLElement>('[data-item-key]') ?? [])];
    const index = rows.findIndex((el) => el.dataset.taskId === task.id);
    if (index >= 0 && rows[index]?.contains(document.activeElement)) {
      const neighbour = rows[index + 1] ?? rows[index - 1];
      pendingFocus.current = {
        removed: task.id,
        next: neighbour?.dataset.taskId ?? null,
        at: Date.now(),
      };
    }
  };
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (Date.now() - pending.at > 2000) {
      pendingFocus.current = null;
      return;
    }
    if (document.activeElement !== document.body && document.activeElement !== null) return;
    pendingFocus.current = null;
    const root = listRoot.current;
    const target = root?.querySelector<HTMLElement>(`[data-task-id="${pending.removed}"]`)
      ? pending.removed
      : pending.next;
    root?.querySelector<HTMLElement>(`[data-task-id="${target ?? ''}"]`)?.focus();
  });

  const toggle = (task: Task) => {
    keepPlace(task);
    if (task.status === 'done') taskActions.update.mutate({ id: task.id, status: 'todo' });
    else taskActions.complete.mutate(task.id);
  };
  // On this page a row means "this task in this goal": removing never deletes the task
  const unlink = (task: Task) => {
    if (!goal) return;
    keepPlace(task);
    if (ui.selectedTaskId === task.id) select(null);
    setTaskGoal.mutate({
      taskId: task.id,
      goalId: null,
      message: `Removed from ${goal.title}.`,
    });
  };

  useTaskShortcuts({
    rootRef: listRoot,
    grid: false,
    getTask: (id) => byId.get(id),
    focusAdd: () => addBox.current?.focus(),
    onToggle: toggle,
    onOpen: (task) => {
      select(task.id);
    },
    onDelete: unlink,
    onEscape: () => {
      if (ui.selectedTaskId !== null) select(null);
      else void navigate({ to: '/tasks/goals' });
    },
    onHelp: () => {
      setHelpOpen(true);
    },
  });

  const backToList = () => {
    void navigate({ to: '/tasks/goals' });
  };

  if (leaving) return null;

  if (goalQuery.isPending) {
    return (
      <p role="status" className="px-8 pt-4 text-body text-fg-muted">
        Loading goal…
      </p>
    );
  }

  if (goalQuery.isError || !goal) {
    const missing = goalQuery.error instanceof ApiError && goalQuery.error.status === 404;
    return (
      <div className="px-8 pt-4">
        {missing ? (
          <GlassCard className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-8 text-center">
            <p className="text-body text-fg">This goal was deleted or does not exist.</p>
            <Button variant="secondary" onClick={backToList}>
              Back to goals
            </Button>
          </GlassCard>
        ) : (
          <GlassCard role="alert" className="flex items-center justify-between gap-4">
            <p className="text-body text-fg">
              {goalQuery.error instanceof ApiError
                ? goalQuery.error.message
                : 'Could not load this goal.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void goalQuery.refetch();
              }}
            >
              Try again
            </Button>
          </GlassCard>
        )}
      </div>
    );
  }

  const context: TaskItemContext = {
    now,
    selectedId: ui.selectedTaskId,
    tabbableKey,
    onFocusItem: setTabKey,
    onSelect: (task) => {
      select(task.id);
    },
    onToggle: toggle,
    onDelete: unlink,
  };
  const achieve = () => {
    setStatus.mutate({ id: goal.id, status: 'achieved' });
  };

  return (
    <div className="flex h-full min-h-0 w-full gap-6 px-8 pt-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
        <GoalHeader
          goal={goal}
          now={now}
          onTitle={(title) => {
            update.mutate({ id: goal.id, title });
          }}
          onTargetAt={(targetAt) => {
            update.mutate({ id: goal.id, targetAt });
          }}
          onAchieve={achieve}
          onDrop={() => {
            setStatus.mutate({ id: goal.id, status: 'dropped' });
          }}
          onReopen={() => {
            setStatus.mutate({ id: goal.id, status: 'active' });
          }}
          onDelete={() => {
            setLeaving(true);
            remove.mutate(goal.id, {
              onSuccess: backToList,
              onError: () => {
                setLeaving(false);
              },
            });
          }}
          onHelp={() => {
            setHelpOpen(true);
          }}
        />
        <GoalProgressCard goal={goal} now={now} />
        <AchievePrompt goal={goal} onAchieve={achieve} />
        <GoalNotes
          description={goal.description}
          onSave={(description) => {
            update.mutate({ id: goal.id, description });
          }}
        />
        {tasksQuery.isError ? (
          <GlassCard role="alert" className="flex items-center justify-between gap-4">
            <p className="text-body text-fg">
              {tasksQuery.error instanceof ApiError
                ? tasksQuery.error.message
                : 'Could not load the tasks of this goal.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void tasksQuery.refetch();
              }}
            >
              Try again
            </Button>
          </GlassCard>
        ) : (
          <GoalTasksCard
            goal={goal}
            open={open}
            done={done}
            archived={archived}
            listRoot={listRoot}
            addBox={addBox}
            context={context}
            tabbableKey={tabbableKey}
            expanded={expanded}
            onToggleGroup={(id) => {
              setExpanded((current) => ({ ...current, [id]: !current[id] }));
            }}
            onCreate={(title) => {
              taskActions.create.mutate({ title, goalId: goal.id });
            }}
            onRemove={unlink}
          />
        )}
      </div>

      {ui.selectedTaskId !== null ? (
        <TaskDetailPanel
          taskId={ui.selectedTaskId}
          onClose={() => {
            const closing = ui.selectedTaskId;
            const inPanel = document.activeElement?.closest('[role="complementary"]') !== null;
            select(null);
            // Keyboard users land back on the task they were editing (if it is still there)
            if (closing !== null && inPanel) {
              setTimeout(() => {
                listRoot.current
                  ?.querySelector<HTMLElement>(`[data-task-id="${closing}"]`)
                  ?.focus();
              }, 0);
            }
          }}
        />
      ) : null}
      {helpOpen ? (
        <GoalShortcutsHelp
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
