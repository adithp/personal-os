import type { Task } from '@personal-os/shared';
import { Input } from '@personal-os/ui';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useRouter } from '@tanstack/react-router';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useGoalActions, useGoals } from '../goals/goals-queries';
import { Popover, PopoverItem } from './popover';

/** The menu shows a search box above this many goals. */
const SEARCH_FROM = 8;

/** Same markup as the Row of the detail panel (that one is private to the panel file). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small font-medium text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * A link to a goal page. A plain anchor that navigates with the router when there is one, so it
 * works as a link for keyboard and screen readers and still renders without a router.
 */
function GoalLink({
  goalId,
  role,
  className,
  children,
  onFollow,
}: {
  goalId?: string;
  role?: 'menuitem';
  className: string;
  children: ReactNode;
  onFollow?: () => void;
}) {
  const router = useRouter({ warn: false }) as ReturnType<typeof useRouter> | undefined;
  const href = goalId ? `/tasks/goals/${goalId}` : '/tasks/goals';
  const follow = (event: MouseEvent) => {
    if (!router) return;
    event.preventDefault();
    onFollow?.();
    if (goalId) void router.navigate({ to: '/tasks/goals/$goalId', params: { goalId } });
    else void router.navigate({ to: '/tasks/goals' });
  };
  return (
    <a
      href={href}
      role={role}
      tabIndex={role ? -1 : undefined}
      onClick={follow}
      className={className}
    >
      {children}
    </a>
  );
}

/** The Goal row of the task detail panel: the task's goal as a chip, and a menu to change it. */
export function GoalSection({ task }: { task: Task }) {
  const { data: goals, isSuccess } = useGoals('active');
  const { setTaskGoal } = useGoalActions();
  const [query, setQuery] = useState('');

  if (task.parentTaskId !== null) {
    // The goal is kept on the parent task, not on its subtasks
    return (
      <Row label="Goal">
        <p className="text-body text-fg-muted">Follows the parent task</p>
      </Row>
    );
  }

  const current = task.goal;
  const active = goals ?? [];
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? active.filter((goal) => goal.title.toLowerCase().includes(needle))
    : active;

  const choose = (goalId: string | null, title: string, close: () => void) => {
    close();
    setQuery('');
    if ((current?.id ?? null) === goalId) return;
    const message = goalId
      ? current
        ? `Moved to ${title}.`
        : `Added to ${title}.`
      : `Removed from ${current?.title ?? title}.`;
    setTaskGoal.mutate({ taskId: task.id, goalId, message });
  };

  return (
    <Row label="Goal">
      <div className="flex items-center gap-1.5">
        {current ? (
          <GoalLink
            goalId={current.id}
            className="inline-flex h-6 max-w-full items-center truncate rounded-[8px] bg-input px-2 text-small text-fg focus-ring hover:bg-glass"
          >
            {current.title}
          </GoalLink>
        ) : (
          <span className="text-body text-fg-muted">No goal</span>
        )}
        <Popover
          label="Change goal"
          popupLabel="Goals"
          triggerClassName="inline-flex size-6 items-center justify-center text-fg-muted hover:text-fg"
          trigger={<IconChevronDown size={14} aria-hidden />}
        >
          {(close) => (
            <>
              {active.length > SEARCH_FROM ? (
                <div className="px-1 pt-1">
                  <Input
                    data-autofocus
                    aria-label="Search goals"
                    placeholder="Search goals"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const first = shown[0];
                        if (first) choose(first.id, first.title, close);
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        event.currentTarget
                          .closest('[role="menu"]')
                          ?.querySelector<HTMLElement>('[role^="menuitem"]')
                          ?.focus();
                      }
                    }}
                  />
                </div>
              ) : null}
              <PopoverItem
                role="menuitemradio"
                checked={current === null}
                onSelect={() => {
                  choose(null, 'goal', close);
                }}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {current === null ? <IconCheck size={14} aria-hidden /> : null}
                </span>
                <span>No goal</span>
              </PopoverItem>
              {isSuccess && active.length === 0 ? (
                <p className="px-2 py-1 text-small text-fg-muted">
                  No active goals. Create one on the{' '}
                  <GoalLink
                    role="menuitem"
                    onFollow={close}
                    className="text-fg underline focus-ring"
                  >
                    Goals page
                  </GoalLink>
                  .
                </p>
              ) : null}
              {needle && isSuccess && active.length > 0 && shown.length === 0 ? (
                <p className="px-2 py-1 text-small text-fg-muted">No matching goals.</p>
              ) : null}
              {shown.map((goal) => {
                const on = goal.id === current?.id;
                return (
                  <PopoverItem
                    key={goal.id}
                    role="menuitemradio"
                    checked={on}
                    onSelect={() => {
                      choose(goal.id, goal.title, close);
                    }}
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      {on ? <IconCheck size={14} aria-hidden /> : null}
                    </span>
                    <span className="truncate">{goal.title}</span>
                  </PopoverItem>
                );
              })}
            </>
          )}
        </Popover>
      </div>
    </Row>
  );
}
