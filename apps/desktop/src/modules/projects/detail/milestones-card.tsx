import { MILESTONE_TITLE_MAX, type Milestone } from '@personal-os/shared';
import { Button, cx, GlassCard, IconButton, Input } from '@personal-os/ui';
import { IconCheck, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { DateTimeBox } from '../../tasks/detail/date-fields';
import { Loading, QueryError } from '../components';
import { useMilestoneActions, useMilestones } from '../projects-queries';

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const { update, remove } = useMilestoneActions();
  const done = milestone.doneAt !== null;
  return (
    <li className="group flex min-h-9 items-center gap-2 rounded-chip px-1 hover:bg-input">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Reopen' : 'Complete'} milestone: ${milestone.title}`}
        onClick={() => {
          update.mutate({ id: milestone.id, done: !done });
        }}
        className={cx(
          'flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] focus-ring transition-colors duration-150 ease-out',
          done
            ? 'border-transparent bg-module-projects text-on-tile'
            : 'border-fg-muted hover:border-fg',
        )}
      >
        {done ? <IconCheck size={12} stroke={2.5} aria-hidden /> : null}
      </button>
      <span
        className={cx(
          'min-w-0 flex-1 truncate text-body',
          done ? 'text-fg-muted line-through' : 'text-fg',
        )}
      >
        {milestone.title}
      </span>
      <div className="w-[150px] shrink-0">
        <DateTimeBox
          label={`Due date of ${milestone.title}`}
          kind="date"
          value={milestone.dueAt}
          onCommit={(iso) => {
            update.mutate({ id: milestone.id, dueAt: iso });
          }}
        />
      </div>
      {milestone.dueAt ? (
        <IconButton
          aria-label={`Clear due date of ${milestone.title}`}
          icon={<IconX size={14} aria-hidden />}
          onClick={() => {
            update.mutate({ id: milestone.id, dueAt: null });
          }}
        />
      ) : (
        <span className="size-[30px] shrink-0" aria-hidden />
      )}
      <IconButton
        aria-label={`Delete milestone: ${milestone.title}`}
        icon={<IconTrash size={14} aria-hidden />}
        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={() => {
          remove.mutate(milestone.id);
        }}
      />
    </li>
  );
}

/** Milestones of a project: add, tick, set a due date, delete. */
export function MilestonesCard({ projectId }: { projectId: string }) {
  const milestones = useMilestones(projectId);
  const { create } = useMilestoneActions();
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);

  const add = () => {
    if (title.trim() === '' || create.isPending) return;
    create.mutate(
      { projectId, title: title.trim(), ...(dueAt ? { dueAt } : {}) },
      {
        onSuccess: () => {
          setTitle('');
          setDueAt(null);
        },
      },
    );
  };

  const list = milestones.data ?? [];
  const done = list.filter((milestone) => milestone.doneAt !== null).length;

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-section font-medium text-fg">Milestones</h2>
        {list.length > 0 ? (
          <span className="text-small text-fg-muted">{`${String(done)} of ${String(list.length)} done`}</span>
        ) : null}
      </div>

      {milestones.isPending ? <Loading text="Loading milestones…" /> : null}
      {milestones.isError ? (
        <QueryError
          error={milestones.error}
          fallback="Could not load the milestones."
          onRetry={() => {
            void milestones.refetch();
          }}
        />
      ) : null}
      {milestones.isSuccess && list.length === 0 ? (
        <p className="text-body text-fg-muted">No milestones yet. Add the first one below.</p>
      ) : null}
      {list.length > 0 ? (
        <ul aria-label="Milestones" className="flex flex-col">
          {list.map((milestone) => (
            <MilestoneRow key={milestone.id} milestone={milestone} />
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          aria-label="New milestone"
          placeholder="Add a milestone"
          value={title}
          maxLength={MILESTONE_TITLE_MAX}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <div className="w-[150px] shrink-0">
          <DateTimeBox label="Milestone due date" kind="date" value={dueAt} onCommit={setDueAt} />
        </div>
        <Button
          variant="secondary"
          disabled={title.trim() === '' || create.isPending}
          onClick={add}
        >
          Add
        </Button>
      </div>
    </GlassCard>
  );
}
