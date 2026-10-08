import type { Task } from '@personal-os/shared';
import { Button, GlassCard } from '@personal-os/ui';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { formatDashboardDate, greetingFor, useNow } from '../../dashboard/greeting';
import { FavoritesSection } from '../favorites/favorites-section';
import { dueSoon, summarize } from '../sections';
import { DueLabel } from '../shared/due-label';
import { TagChips } from '../shared/tag-chip';
import { TaskCheckbox } from '../shared/task-checkbox';
import { useOpenTasks, useTaskActions } from '../tasks-queries';
import { useTasksUi } from '../tasks-ui-store';

function DueSoonRow({
  task,
  now,
  onOpen,
  onComplete,
}: {
  task: Task;
  now: Date;
  onOpen: () => void;
  onComplete: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 rounded-chip px-2 py-1.5 transition-colors duration-150 ease-out hover:bg-tint">
      <TaskCheckbox task={task} onToggle={onComplete} />
      <button
        type="button"
        aria-label={`Open: ${task.title}`}
        onClick={onOpen}
        className="min-w-0 flex-1 truncate rounded-chip text-left text-body text-fg focus-ring"
      >
        {task.title}
      </button>
      <TagChips tags={task.tags} max={2} />
      <DueLabel task={task} now={now} />
    </li>
  );
}

/** Overview: greeting, summary, and the tasks due soon. */
export function OverviewPage() {
  const now = useNow();
  const tasks = useOpenTasks();
  const { complete } = useTaskActions();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();

  const items = tasks.data ?? [];
  const summary = summarize(items, now);
  const soon = dueSoon(items, now, 5);

  const open = (id: string) => {
    useTasksUi.getState().select(id);
    void navigate({ to: '/tasks/my-tasks' });
  };

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5 px-2 pb-6">
      <div>
        <h1 className="text-page font-semibold text-fg">{greetingFor(now)}</h1>
        <p className="text-small text-fg-muted">{formatDashboardDate(now)}</p>
        <p className="mt-1 text-body text-fg-secondary">
          {tasks.isSuccess
            ? `${String(summary.open)} open · ${String(summary.overdue)} overdue`
            : ' '}
        </p>
      </div>

      <GlassCard aria-label="Tasks due soon" role="region" className="flex flex-col gap-2">
        <h2 className="text-section font-semibold text-fg">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => {
              setExpanded((value) => !value);
            }}
            className="-ml-1 flex items-center gap-1 rounded-chip px-1 focus-ring"
          >
            {expanded ? (
              <IconChevronDown size={16} aria-hidden />
            ) : (
              <IconChevronRight size={16} aria-hidden />
            )}
            Tasks due soon
          </button>
        </h2>

        <div id={bodyId} hidden={!expanded} className="flex flex-col gap-2">
          {tasks.isPending ? <p className="px-2 text-body text-fg-muted">Loading tasks…</p> : null}

          {tasks.isError ? (
            <div role="alert" className="flex items-center justify-between gap-4 px-2">
              <p className="text-body text-fg">
                {tasks.error instanceof ApiError
                  ? tasks.error.message
                  : 'Could not load your tasks.'}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  void tasks.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          ) : null}

          {tasks.isSuccess && soon.length === 0 ? (
            <p className="px-2 text-body text-fg-muted">Nothing due soon</p>
          ) : null}

          {soon.length > 0 ? (
            <ul className="flex flex-col">
              {soon.map((task) => (
                <DueSoonRow
                  key={task.id}
                  task={task}
                  now={now}
                  onOpen={() => {
                    open(task.id);
                  }}
                  onComplete={() => {
                    complete.mutate(task.id);
                  }}
                />
              ))}
            </ul>
          ) : null}

          <Link
            to="/tasks/my-tasks"
            className="self-start rounded-chip px-2 text-small text-fg-secondary focus-ring hover:text-fg"
          >
            See all my tasks
          </Link>
        </div>
      </GlassCard>

      <FavoritesSection />
    </div>
  );
}
