import { useDndContext, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { cx } from '@personal-os/ui';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import type { ReactNode, Ref } from 'react';
import { sectionDropId } from '../drag/drop-ids';
import type { TaskGroup } from '../filters';
import type { SectionId } from '../sections';
import { itemKeyOf } from './drop-plan';
import { SortableCard, SortableRow } from './sortable-item';
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
  /**
   * Drag and drop: cards and rows can be lifted (the page has a DndContext). `sections` is true
   * when Group is Due, so the whole section is also a place to drop.
   */
  dnd?: { sections: boolean };
}

/** One group of tasks: a collapsible heading with a count, then cards in a grid or list rows. */
export function TaskSection(props: TaskSectionProps) {
  const { dnd, ...rest } = props;
  return dnd ? <DraggableSection {...rest} sections={dnd.sections} /> : <SectionBody {...rest} />;
}

function DraggableSection({
  sections,
  ...props
}: Omit<TaskSectionProps, 'dnd'> & { sections: boolean }) {
  const { group, view, heading, collapsed } = props;
  const dropId = sectionDropId(group.id as SectionId);
  const { setNodeRef } = useDroppable({ id: dropId, disabled: !sections });
  const { active, over } = useDndContext();
  // Overdue accepts no drops, so it never looks like a place to drop
  const lifted = active === null ? '' : String(active.id);
  const overId = over === null ? '' : String(over.id);
  const highlight =
    sections &&
    group.id !== 'overdue' &&
    (overId === dropId || overId.startsWith(`${group.id}/`)) &&
    !lifted.startsWith(`${group.id}/`);
  const open = !heading || !collapsed;
  const keys = open ? group.tasks.map((task) => itemKeyOf(group.id, task.id)) : [];
  return (
    <SortableContext
      items={keys}
      strategy={view === 'cards' ? rectSortingStrategy : verticalListSortingStrategy}
    >
      <SectionBody {...props} sectionRef={setNodeRef} highlight={highlight} sortable />
    </SortableContext>
  );
}

function SectionBody({
  group,
  view,
  heading,
  collapsed,
  onToggle,
  context,
  footer,
  sectionRef,
  highlight,
  sortable,
}: Omit<TaskSectionProps, 'dnd'> & {
  sectionRef?: Ref<HTMLElement>;
  highlight?: boolean;
  sortable?: boolean;
}) {
  const open = !heading || !collapsed;
  const Item = sortable
    ? view === 'cards'
      ? SortableCard
      : SortableRow
    : view === 'cards'
      ? TaskCard
      : TaskRow;
  return (
    <section
      ref={sectionRef}
      aria-label={group.label}
      className={cx(
        'flex flex-col gap-2 rounded-card transition-shadow duration-150 ease-out',
        highlight && 'ring-1 ring-accent',
      )}
    >
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
            <Item
              key={task.id}
              task={task}
              itemKey={itemKeyOf(group.id, task.id)}
              context={context}
            />
          ))}
        </ul>
      ) : null}
      {open ? footer : null}
    </section>
  );
}
