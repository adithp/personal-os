import type { Task } from '@personal-os/shared';
import { cx, ProgressBar } from '@personal-os/ui';
import { IconRepeat, IconTrash } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { BlockedBadge } from '../shared/blocked-badge';
import { DueLabel } from '../shared/due-label';
import { TaskCheckbox } from '../shared/task-checkbox';
import { PriorityFlag } from '../shared/priority-flag';
import { TagChips } from '../shared/tag-chip';

/** What every card and row needs from the page. */
export interface TaskItemContext {
  now: Date;
  selectedId: string | null;
  /** The one item that is a Tab stop (roving tabindex). */
  tabbableKey: string | null;
  onFocusItem: (key: string) => void;
  onSelect: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** Drag support for a card or row: whoever makes it sortable (dnd-kit useSortable) fills this in. */
export interface TaskItemDrag {
  setNodeRef: (element: HTMLElement | null) => void;
  /** The transform and transition from dnd-kit. */
  style?: CSSProperties;
  /** A DragHandle with the sortable's attributes and listeners spread onto it. */
  handle: ReactNode;
  /** This item is the one being dragged (it stays behind as a faint placeholder). */
  dragging?: boolean;
}

export interface TaskItemProps {
  task: Task;
  /** Quick actions shown on the right of a row on hover or focus (the Inbox). Rows only. */
  actions?: ReactNode;
  /** Rows only: leave out the trash button (the Inbox keeps Delete in its More menu). */
  hideDelete?: boolean;
  drag?: TaskItemDrag;
  /** Unique on the page (a task can be in two tag groups). */
  itemKey: string;
  context: TaskItemContext;
  /** The copy that follows the pointer while dragging: not a real item, hidden from the keyboard and screen readers. */
  overlay?: boolean;
}

function itemProps({ task, itemKey, context, overlay }: TaskItemProps) {
  const selected = context.selectedId === task.id;
  if (overlay) return { selected, attrs: { 'aria-hidden': true as const } };
  return {
    selected,
    attrs: {
      'data-task-id': task.id,
      'data-item-key': itemKey,
      'data-selected': selected ? 'true' : undefined,
      'aria-current': selected ? ('true' as const) : undefined,
      tabIndex: context.tabbableKey === itemKey ? 0 : -1,
      onFocus: () => {
        context.onFocusItem(itemKey);
      },
      onClick: () => {
        context.onSelect(task);
      },
    },
  };
}

const subtaskPercent = (task: Task) =>
  task.subtaskCount > 0 ? (task.subtasksDone / task.subtaskCount) * 100 : 0;

/** A glass card: checkbox and title, one tag, subtask progress, and a quiet footer. */
export function TaskCard(props: TaskItemProps) {
  const { task, context, drag } = props;
  const { selected, attrs } = itemProps(props);
  const done = task.status === 'done';
  return (
    <li
      {...attrs}
      ref={drag?.setNodeRef}
      style={drag?.style}
      className={cx(
        'group relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-card glass p-3 focus-ring',
        'transition-[transform,opacity] duration-150 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        selected && 'ring-1 ring-accent',
        done && 'opacity-60',
        drag?.dragging && 'opacity-40',
      )}
    >
      {drag ? <span className="absolute top-1.5 right-1">{drag.handle}</span> : null}
      <div className="flex items-start gap-2">
        <TaskCheckbox
          tabIndex={-1}
          className="mt-px"
          task={task}
          onToggle={() => {
            context.onToggle(task);
          }}
        />
        <span
          className={cx(
            'line-clamp-2 min-w-0 text-body break-words',
            drag && 'pr-5',
            done ? 'text-fg-muted line-through' : 'text-fg',
          )}
        >
          {task.title}
        </span>
      </div>
      {task.tags.length > 0 || task.blockedBy.length > 0 ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <TagChips tags={task.tags} max={1} />
          <BlockedBadge blockedBy={task.blockedBy} />
        </div>
      ) : null}
      {task.subtaskCount > 0 ? (
        <div className="flex items-center gap-2">
          <ProgressBar
            value={subtaskPercent(task)}
            label={`Subtasks done: ${String(task.subtasksDone)} of ${String(task.subtaskCount)}`}
          />
          <span className="shrink-0 text-small text-fg-muted">
            {task.subtasksDone}/{task.subtaskCount}
          </span>
        </div>
      ) : null}
      <div className="mt-auto flex min-h-4 items-center gap-2">
        <DueLabel task={task} now={context.now} icon />
        {task.recurrenceRule ? (
          <IconRepeat
            size={12}
            className="shrink-0 text-fg-muted"
            role="img"
            aria-label="Repeats"
          />
        ) : null}
        <span className="ml-auto">
          <PriorityFlag priority={task.priority} />
        </span>
      </div>
    </li>
  );
}

/** A compact row for List view. */
export function TaskRow(props: TaskItemProps) {
  const { task, context, drag, actions, hideDelete } = props;
  const { selected, attrs } = itemProps(props);
  const done = task.status === 'done';
  return (
    <li
      {...attrs}
      ref={drag?.setNodeRef}
      style={drag?.style}
      className={cx(
        'group flex min-w-0 cursor-pointer items-center gap-3 rounded-control px-3 py-2 focus-ring',
        'transition-colors duration-150 ease-out hover:bg-input',
        selected && 'bg-input',
        done && 'opacity-60',
        drag?.dragging && 'opacity-40',
      )}
    >
      {drag?.handle}
      <TaskCheckbox
        tabIndex={-1}
        className="mt-px"
        task={task}
        onToggle={() => {
          context.onToggle(task);
        }}
      />
      <span
        className={cx(
          'min-w-0 truncate text-body',
          done ? 'text-fg-muted line-through' : 'text-fg',
        )}
      >
        {task.title}
      </span>
      <BlockedBadge blockedBy={task.blockedBy} />
      {task.subtaskCount > 0 ? (
        <span
          className="shrink-0 text-small text-fg-muted"
          aria-label={`${String(task.subtasksDone)} of ${String(task.subtaskCount)} subtasks done`}
        >
          {task.subtasksDone}/{task.subtaskCount}
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {task.recurrenceRule ? (
          <IconRepeat size={13} className="text-fg-muted" role="img" aria-label="Repeats" />
        ) : null}
        <TagChips tags={task.tags} max={1} />
        <PriorityFlag priority={task.priority} />
        <DueLabel task={task} now={context.now} />
        {actions}
        {hideDelete ? null : (
          <button
            type="button"
            aria-label={`Delete: ${task.title}`}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              context.onDelete(task);
            }}
            className="rounded-[6px] p-1 text-fg-muted opacity-0 focus-ring transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
          >
            <IconTrash size={16} stroke={1.5} aria-hidden />
          </button>
        )}
      </span>
    </li>
  );
}
