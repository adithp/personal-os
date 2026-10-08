import type { Task } from '@personal-os/shared';
import { cx, moduleColorVar } from '@personal-os/ui';
import { IconCheck, IconTrash } from '@tabler/icons-react';
import { dueLabel } from './dates';
import { priorityColor, priorityLabel } from './priority';

export interface TaskRowProps {
  task: Task;
  now: Date;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** One task: a round checkbox, the title, and quiet details that show only when they matter. */
export function TaskRow({ task, now, selected, onSelect, onToggle, onDelete }: TaskRowProps) {
  const done = task.status === 'done';
  const due = task.dueAt ? dueLabel(task.dueAt, now, done) : null;
  const dot = priorityColor(task.priority);

  return (
    <li
      data-selected={selected ? 'true' : undefined}
      className={cx(
        'group flex items-center gap-3 rounded-control px-3 py-2 transition-colors duration-150 ease-out',
        selected ? 'bg-input' : 'hover:bg-input',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Reopen' : 'Complete'}: ${task.title}`}
        onClick={() => {
          onToggle(task);
        }}
        className={cx(
          'flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] focus-ring transition-colors duration-150 ease-out',
          done ? 'border-transparent text-on-tile' : 'border-fg-muted hover:border-fg',
        )}
        style={done ? { backgroundColor: moduleColorVar('tasks') } : undefined}
      >
        {done ? <IconCheck size={12} stroke={2.5} aria-hidden /> : null}
      </button>

      <button
        type="button"
        onClick={() => {
          onSelect(task.id);
        }}
        aria-label={`Open: ${task.title}`}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[6px] text-left focus-ring"
      >
        <span className={cx('truncate text-body', done ? 'text-fg-muted line-through' : 'text-fg')}>
          {task.title}
        </span>
        {task.status === 'doing' ? (
          <span className="shrink-0 text-small text-fg-muted">In progress</span>
        ) : null}
      </button>

      {due ? (
        <span className={cx('shrink-0 text-small', due.overdue ? 'text-danger' : 'text-fg-muted')}>
          {due.overdue ? 'Overdue · ' : ''}
          {due.text}
        </span>
      ) : null}

      {dot ? (
        <span
          role="img"
          aria-label={`${priorityLabel(task.priority)} priority`}
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      ) : null}

      <button
        type="button"
        aria-label={`Delete: ${task.title}`}
        onClick={() => {
          onDelete(task);
        }}
        className="shrink-0 rounded-[6px] p-1 text-fg-muted opacity-0 focus-ring transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-danger"
      >
        <IconTrash size={16} stroke={1.5} aria-hidden />
      </button>
    </li>
  );
}
