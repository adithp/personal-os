import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Task } from '@personal-os/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useToasts } from '../../../store/toast-store';
import { fromIstDate } from '../dates';
import { taskAnnouncements, useTaskSensors } from '../drag/dnd';
import { parseDropId } from '../drag/drop-ids';
import type { DropResult } from '../drag/resolve-drop';
import type { GroupKey, TaskGroup } from '../filters';
import { SECTION_LABELS } from '../sections';
import { useTaskActions } from '../tasks-queries';
import { DRAG_HANDLE_ATTRIBUTE } from './sortable-item';
import { DropDatePicker } from './drop-date-picker';
import { parseItemKey, planDrop } from './drop-plan';
import { TaskCard, TaskRow, type TaskItemContext } from './task-item';

export interface TasksDndProps {
  groups: readonly TaskGroup[];
  groupKey: GroupKey;
  view: 'cards' | 'list';
  now: Date;
  manualSort: boolean;
  context: TaskItemContext;
  children: ReactNode;
}

type PickDate = Extract<DropResult, { kind: 'pick-date' }>;

/**
 * With a pointer, a card or row under it wins over the section area it sits in (the section only
 * counts in its gaps). With the keyboard (no pointer), the closest one wins.
 */
const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCenter(args).slice(0, 1);
  const items = hits.filter((hit) => parseDropId(String(hit.id)) === null);
  return (items.length > 0 ? items : hits).slice(0, 1);
};

/** True when the dragged rect ends after (below, or right of in the same row) the one it is over. */
function endsAfter(active: ClientRect, over: ClientRect): boolean {
  const centerY = active.top + active.height / 2;
  if (centerY >= over.top && centerY <= over.top + over.height) {
    return active.left + active.width / 2 > over.left + over.width / 2;
  }
  return centerY > over.top + over.height / 2;
}

/**
 * Drag and drop for the Cards and List views: the sensors, spoken announcements, the copy that
 * follows the pointer, and what happens on a drop (planDrop decides, this applies it). A drop on
 * Upcoming opens a small date picker; nothing is sent until a day is chosen.
 */
export function TasksDnd({
  groups,
  groupKey,
  view,
  now,
  manualSort,
  context,
  children,
}: TasksDndProps) {
  const sensors = useTaskSensors();
  const { move } = useTaskActions();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [width, setWidth] = useState<number | undefined>();
  const [picking, setPicking] = useState<{
    plan: PickDate;
    task: Task;
    anchor: { left: number; top: number };
  } | null>(null);
  const withKeyboard = useRef(false);
  const pendingFocus = useRef<{ taskId: string; until: number } | null>(null);

  // A keyboard user keeps their place: the card may land in another section, which remounts it
  // (dnd-kit's own focus restore is off, because it looks for the old card)
  const keepPlace = (task: Task) => {
    if (withKeyboard.current) pendingFocus.current = { taskId: task.id, until: Date.now() + 2000 };
  };
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (Date.now() > pending.until) {
      pendingFocus.current = null;
      return;
    }
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.isConnected) return;
    document
      .querySelector<HTMLElement>(`[data-task-id="${pending.taskId}"] [${DRAG_HANDLE_ATTRIBUTE}]`)
      ?.focus();
  });

  const taskOf = (key: string): Task | undefined => {
    const parsed = parseItemKey(key);
    return groups
      .find((group) => group.id === parsed?.groupId)
      ?.tasks.find((t) => t.id === parsed?.taskId);
  };
  const titleOf = (id: string) => taskOf(id)?.title ?? 'Task';
  const nameOf = (id: string) => {
    const section = parseDropId(id);
    if (section?.kind === 'section') return SECTION_LABELS[section.section];
    const parsed = parseItemKey(id);
    const group = groups.find((candidate) => candidate.id === parsed?.groupId);
    return groupKey === 'none' || !group ? titleOf(id) : `${titleOf(id)} in ${group.label}`;
  };

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    withKeyboard.current = activatorEvent instanceof KeyboardEvent;
    setWidth(active.rect.current.initial?.width);
    setActiveKey(String(active.id));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKey(null);
    const key = String(active.id);
    const task = taskOf(key);
    const translated = active.rect.current.translated;
    const result = planDrop({
      activeKey: key,
      overKey: over ? String(over.id) : null,
      groups,
      groupKey,
      now,
      manualSort,
      after: over && translated ? endsAfter(translated, over.rect) : false,
    });
    switch (result.kind) {
      case 'move':
        move.mutate({ input: result.input, position: result.position });
        break;
      case 'pick-date':
        if (task && over) {
          setPicking({
            plan: result,
            task,
            anchor: { left: over.rect.left, top: over.rect.top + over.rect.height + 4 },
          });
        }
        break;
      case 'reject':
        useToasts.getState().show(result.message, { tone: 'error' });
        break;
      case 'none':
        break;
    }
    if (result.kind === 'move' && task) keepPlace(task);
  };

  const lifted = activeKey === null ? undefined : taskOf(activeKey);
  const Overlay = view === 'cards' ? TaskCard : TaskRow;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      accessibility={{ announcements: taskAnnouncements(titleOf, nameOf), restoreFocus: false }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveKey(null);
      }}
    >
      {children}
      <DragOverlay>
        {lifted && activeKey ? (
          <ul data-drag-overlay style={{ width }}>
            <Overlay task={lifted} itemKey={activeKey} context={context} overlay />
          </ul>
        ) : null}
      </DragOverlay>
      {picking ? (
        <DropDatePicker
          title={picking.task.title}
          now={now}
          anchor={picking.anchor}
          onCancel={() => {
            setPicking(null);
          }}
          onPick={(date) => {
            const dueAt = fromIstDate(date);
            if (!dueAt) return;
            move.mutate({
              input: { ...picking.plan.input, dueAt, dueAllDay: true },
              position: picking.plan.position,
            });
            keepPlace(picking.task);
            setPicking(null);
          }}
        />
      ) : null}
    </DndContext>
  );
}
