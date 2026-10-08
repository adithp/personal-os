import { istDayStartPlus, toIstDate } from '../dates';
import { resolveDrop, type DropResult, type DropTarget } from '../drag/resolve-drop';
import { parseDropId } from '../drag/drop-ids';
import type { GroupKey, TaskGroup } from '../filters';
import type { SectionId } from '../sections';

/** The day after today in India time, "2025-10-08": the earliest day Upcoming accepts. */
export const tomorrowOf = (now: Date) => toIstDate(istDayStartPlus(now.getTime(), 1));

/** The sortable id of a card or row: unique on the page, because a task can be in two tag groups. */
export const itemKeyOf = (groupId: string, taskId: string) => `${groupId}/${taskId}`;

/** Splits an item key back into its group id and task id (null for anything else). */
export function parseItemKey(key: string): { groupId: string; taskId: string } | null {
  const at = key.indexOf('/');
  if (at <= 0 || at === key.length - 1) return null;
  return { groupId: key.slice(0, at), taskId: key.slice(at + 1) };
}

export interface DropPlanInput {
  /** The sortable id of the dragged card or row. */
  activeKey: string;
  /** The id of what it was dropped on: another card or row, or a section area. */
  overKey: string | null;
  /** The groups as shown on the page (filtered and sorted). */
  groups: readonly TaskGroup[];
  groupKey: GroupKey;
  now: Date;
  /** Sort is Manual. */
  manualSort: boolean;
  /** Dropped on a card or row from another group, below or after it. */
  after?: boolean;
}

/**
 * Turns a drop on My tasks into what to do (see resolveDrop). It works out the destination group,
 * the neighbours the task will sit between (without the dragged task itself), and whether the drop
 * stayed inside the group it was lifted from. Dropping on a section area appends to its end.
 */
export function planDrop({
  activeKey,
  overKey,
  groups,
  groupKey,
  now,
  manualSort,
  after = false,
}: DropPlanInput): DropResult {
  const none: DropResult = { kind: 'none' };
  const from = parseItemKey(activeKey);
  if (!from || overKey === null) return none;
  const source = groups.find((group) => group.id === from.groupId);
  const task = source?.tasks.find((candidate) => candidate.id === from.taskId);
  if (!source || !task) return none;

  const overSection = parseDropId(overKey);
  const over = parseItemKey(overKey);
  const destId = overSection?.kind === 'section' ? overSection.section : over?.groupId;
  const dest = groups.find((group) => group.id === destId);
  if (!dest) return none;

  const sameContainer = dest.id === source.id;
  const rest = dest.tasks.filter((candidate) => candidate.id !== task.id);
  let insertAt = rest.length;
  if (!overSection && over) {
    const overIndex = rest.findIndex((candidate) => candidate.id === over.taskId);
    if (overIndex < 0) {
      // Dropped on itself: where it is now
      insertAt = source.tasks.indexOf(task);
    } else if (sameContainer) {
      // Like moving an item in a list: it takes the place of the card it was dropped on
      insertAt = source.tasks.findIndex((candidate) => candidate.id === over.taskId);
    } else {
      insertAt = overIndex + (after ? 1 : 0);
    }
  }
  if (sameContainer && source.tasks.indexOf(task) === insertAt) return none;

  const target: DropTarget =
    groupKey === 'due' ? { kind: 'section', section: dest.id as SectionId } : { kind: 'list' };
  return resolveDrop({
    task,
    target,
    // The neighbours come from the shown order, which only means something in Manual sort
    ...(manualSort ? { prev: rest[insertAt - 1], next: rest[insertAt] } : {}),
    now,
    manualSort,
    sameContainer,
  });
}
