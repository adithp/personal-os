import { cx } from '@personal-os/ui';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { TaskGroup } from '../filters';
import { TaskCard, TaskRow, type TaskItemContext } from './task-item';

export interface TaskSectionProps {
  group: TaskGroup;
  view: 'cards' | 'list';
  /** false for the single "All tasks" group, which has no heading. */
  heading: boolean;
  collapsed: boolean;
  onToggle: () => void;
  context: TaskItemContext;
  /** Shown under the tasks (the Completed section's "Show more"). */
  footer?: ReactNode;
}

/** One group of tasks: a collapsible heading with a count, then cards in a grid or list rows. */
export function TaskSection({
  group,
  view,
  heading,
  collapsed,
  onToggle,
  context,
  footer,
}: TaskSectionProps) {
  const open = !heading || !collapsed;
  const Item = view === 'cards' ? TaskCard : TaskRow;
  return (
    <section aria-label={group.label} className="flex flex-col gap-2">
      {heading ? (
        <h2 className="text-small font-medium text-fg-muted">
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="-ml-1 flex items-center gap-1 rounded-[6px] px-1 py-0.5 focus-ring hover:text-fg"
          >
            {collapsed ? (
              <IconChevronRight size={14} aria-hidden />
            ) : (
              <IconChevronDown size={14} aria-hidden />
            )}
            {group.label}
            <span className="font-normal">{group.tasks.length}</span>
          </button>
        </h2>
      ) : null}
      {open && group.tasks.length > 0 ? (
        <ul
          className={cx(
            view === 'cards'
              ? 'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2'
              : 'flex flex-col',
          )}
        >
          {group.tasks.map((task) => (
            <Item key={task.id} task={task} itemKey={`${group.id}/${task.id}`} context={context} />
          ))}
        </ul>
      ) : null}
      {open ? footer : null}
    </section>
  );
}
