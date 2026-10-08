import type { Task } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { IconCalendar } from '@tabler/icons-react';
import { dueLabel } from '../dates';

export interface DueLabelProps {
  task: Pick<Task, 'dueAt' | 'dueAllDay' | 'status'>;
  now: Date;
  /** Show a small calendar icon before the text (cards do, rows do not). */
  icon?: boolean;
  className?: string;
}

/**
 * The relative due date. Red when the due day is before today (and for a time today that has
 * passed); an all-day task shows no time. Renders nothing for a task with no due date.
 */
export function DueLabel({ task, now, icon = false, className }: DueLabelProps) {
  if (!task.dueAt) return null;
  const due = dueLabel(task.dueAt, now, task.status === 'done', task.dueAllDay);
  return (
    <span
      data-overdue={due.overdue ? 'true' : undefined}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 text-small',
        due.overdue || due.timePassed ? 'text-danger' : 'text-fg-muted',
        className,
      )}
    >
      {icon ? <IconCalendar size={12} aria-hidden /> : null}
      {due.overdue ? <span className="sr-only">Overdue: </span> : null}
      {due.text}
    </span>
  );
}
