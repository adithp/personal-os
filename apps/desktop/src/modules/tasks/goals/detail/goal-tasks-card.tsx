import type { Goal, Task } from '@personal-os/shared';
import { cx, GlassCard, Tooltip } from '@personal-os/ui';
import { IconChevronRight, IconLinkOff, IconPlus } from '@tabler/icons-react';
import { useState, type RefObject } from 'react';
import { TaskRow, type TaskItemContext } from '../../my-tasks/task-item';
import { AddTasksPopover } from './add-tasks-popover';
import { itemKeyOf, type GroupId } from './goal-task-keys';

export interface GoalTasksCardProps {
  goal: Goal;
  open: Task[];
  done: Task[];
  archived: Task[];
  listRoot: RefObject<HTMLDivElement | null>;
  addBox: RefObject<HTMLInputElement | null>;
  context: TaskItemContext;
  tabbableKey: string | null;
  expanded: Record<GroupId, boolean>;
  onToggleGroup: (id: GroupId) => void;
  onCreate: (title: string) => void;
  onRemove: (task: Task) => void;
}

function Group({
  label,
  tasks,
  muted,
  expanded,
  onToggle,
  ...rest
}: {
  label: string;
  tasks: Task[];
  muted?: boolean;
  expanded: boolean;
  onToggle: () => void;
  context: TaskItemContext;
  tabbableKey: string | null;
  onRemove: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cx(
          'mt-1 flex h-7 w-fit items-center gap-1 rounded-chip px-2 text-small focus-ring hover:bg-input',
          muted ? 'text-fg-muted' : 'text-fg-secondary',
        )}
      >
        <IconChevronRight
          size={13}
          stroke={1.5}
          aria-hidden
          className={cx(
            'transition-transform duration-150 motion-reduce:transition-none',
            expanded && 'rotate-90',
          )}
        />
        {`${label} (${String(tasks.length)})`}
      </button>
      {expanded ? <Rows tasks={tasks} {...rest} /> : null}
    </div>
  );
}

function Rows({
  tasks,
  context,
  tabbableKey,
  onRemove,
  label,
}: {
  tasks: Task[];
  context: TaskItemContext;
  tabbableKey: string | null;
  onRemove: (task: Task) => void;
  label?: string;
}) {
  return (
    <ul aria-label={label} className="flex flex-col">
      {tasks.map((task) => {
        const itemKey = itemKeyOf(task);
        return (
          <TaskRow
            key={task.id}
            task={task}
            itemKey={itemKey}
            context={context}
            hideDelete
            actions={
              <Tooltip label="Remove from goal">
                <button
                  type="button"
                  aria-label={`Remove from goal: ${task.title}`}
                  tabIndex={tabbableKey === itemKey ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(task);
                  }}
                  className="rounded-[6px] p-1 text-fg-muted opacity-0 focus-ring transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 motion-reduce:transition-none"
                >
                  <IconLinkOff size={16} stroke={1.5} aria-hidden />
                </button>
              </Tooltip>
            }
          />
        );
      })}
    </ul>
  );
}

/** The goal's tasks: an add box, the open ones, then collapsed Done and Archived groups. */
export function GoalTasksCard({
  goal,
  open,
  done,
  archived,
  listRoot,
  addBox,
  context,
  tabbableKey,
  expanded,
  onToggleGroup,
  onCreate,
  onRemove,
}: GoalTasksCardProps) {
  const [title, setTitle] = useState('');
  const shared = { context, tabbableKey, onRemove };
  return (
    <GlassCard aria-labelledby="goal-tasks-heading" role="region" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="goal-tasks-heading" className="flex-1 text-section font-medium text-fg">
          Tasks
        </h2>
        <AddTasksPopover goal={goal} />
      </div>
      <label className="flex h-[34px] items-center gap-2 rounded-control bg-input px-2.5">
        <IconPlus size={14} stroke={1.5} className="shrink-0 text-fg-muted" aria-hidden />
        <input
          ref={addBox}
          type="text"
          aria-label="Add a task to this goal"
          placeholder="Add a task to this goal…"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const next = title.trim();
            if (next === '') return;
            event.preventDefault();
            onCreate(next);
            setTitle('');
          }}
          className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        />
      </label>
      <div ref={listRoot} className="flex flex-col">
        {open.length > 0 ? <Rows tasks={open} label="Open tasks" {...shared} /> : null}
        <Group
          label="Done"
          tasks={done}
          expanded={expanded.done}
          onToggle={() => {
            onToggleGroup('done');
          }}
          {...shared}
        />
        <Group
          label="Archived"
          tasks={archived}
          muted
          expanded={expanded.archived}
          onToggle={() => {
            onToggleGroup('archived');
          }}
          {...shared}
        />
      </div>
    </GlassCard>
  );
}
