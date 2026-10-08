import {
  TASK_PRIORITY_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@personal-os/shared';
import { istDay } from './dates';
import { sectionOf, SECTION_IDS, SECTION_LABELS } from './sections';

/**
 * Filter, sort, and group for My tasks. All client-side: a single user's tasks are few, so the page
 * loads them once and these pure functions shape them. The filter also travels in the URL
 * (search params), which is how a favorite opens My tasks with its saved filter.
 */
export const DUE_FILTERS = ['any', 'overdue', 'today', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  /** Tag ids; a task matches when it has any of them. */
  tagIds?: string[];
  due?: DueFilter;
  /** true: show archived tasks only. */
  archived?: boolean;
}

export const SORT_KEYS = ['manual', 'due', 'priority', 'created', 'title'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const GROUP_KEYS = ['due', 'none', 'tag', 'priority'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

/** Defaults agreed for My tasks: grouped by due date sections, manual order. */
export const DEFAULT_SORT: SortKey = 'manual';
export const DEFAULT_GROUP: GroupKey = 'due';

export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    (filters.status?.length ?? 0) > 0 ||
    (filters.priority?.length ?? 0) > 0 ||
    (filters.tagIds?.length ?? 0) > 0 ||
    (filters.due !== undefined && filters.due !== 'any') ||
    filters.archived === true
  );
}

/** Applies the filters. Subtasks are never in the lists, so they are left out here too. */
export function applyFilters(tasks: readonly Task[], filters: TaskFilters, now: Date): Task[] {
  const today = istDay(now.getTime());
  return tasks.filter((task) => {
    if (task.parentTaskId !== null) return false;
    if (Boolean(filters.archived) !== (task.archivedAt !== null)) return false;
    if (filters.status?.length && !filters.status.includes(task.status)) return false;
    if (filters.priority?.length && !filters.priority.includes(task.priority)) return false;
    if (filters.tagIds?.length && !task.tags.some((tag) => filters.tagIds?.includes(tag.id))) {
      return false;
    }
    switch (filters.due ?? 'any') {
      case 'any':
        return true;
      case 'none':
        return task.dueAt === null;
      case 'overdue':
        return task.status !== 'done' && sectionOf(task, now) === 'overdue';
      case 'today':
        return task.dueAt !== null && istDay(Date.parse(task.dueAt)) === today;
      case 'week': {
        if (task.dueAt === null) return false;
        const day = istDay(Date.parse(task.dueAt));
        return day >= today && day < today + 7;
      }
    }
  });
}

const byNumber = (a: number, b: number) => a - b;

/** Sorts a copy. Ties keep manual order, then oldest first. Tasks without a due date go last. */
export function sortTasks(
  tasks: readonly Task[],
  key: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Task[] {
  const direction = order === 'asc' ? 1 : -1;
  const compare = (a: Task, b: Task): number => {
    switch (key) {
      case 'manual':
        return byNumber(a.position, b.position);
      case 'priority':
        return byNumber(a.priority, b.priority);
      case 'created':
        return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      case 'title':
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      case 'due':
        // handled below: missing dates always last
        return 0;
    }
  };
  return [...tasks].sort((a, b) => {
    if (key === 'due') {
      if (a.dueAt === null && b.dueAt === null) return byNumber(a.position, b.position);
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      const due = (Date.parse(a.dueAt) - Date.parse(b.dueAt)) * direction;
      return due || byNumber(a.position, b.position);
    }
    return (
      compare(a, b) * direction ||
      byNumber(a.position, b.position) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
  });
}

export interface TaskGroup {
  /** Stable key: a section id, a tag id, "p1" to "p4", or "all". */
  id: string;
  label: string;
  tasks: Task[];
}

/**
 * Groups tasks. "due" gives the date sections in their fixed order (empty sections are kept so the
 * page can show their headings and accept drops); the other groupings leave out empty groups.
 * A task with several tags appears in each tag's group; untagged tasks go to "No tag".
 */
export function groupTasks(
  tasks: readonly Task[],
  key: GroupKey,
  now: Date,
  tagNames?: ReadonlyMap<string, string>,
): TaskGroup[] {
  switch (key) {
    case 'none':
      return [{ id: 'all', label: 'All tasks', tasks: [...tasks] }];
    case 'due': {
      const buckets = new Map<string, Task[]>(SECTION_IDS.map((id) => [id, []]));
      for (const task of tasks) buckets.get(sectionOf(task, now))?.push(task);
      return SECTION_IDS.map((id) => ({
        id,
        label: SECTION_LABELS[id],
        tasks: buckets.get(id) ?? [],
      }));
    }
    case 'priority':
      return ([1, 2, 3, 4] as const)
        .map((p) => ({
          id: `p${String(p)}`,
          label: TASK_PRIORITY_LABELS[p],
          tasks: tasks.filter((task) => task.priority === p),
        }))
        .filter((group) => group.tasks.length > 0);
    case 'tag': {
      const groups = new Map<string, TaskGroup>();
      const untagged: Task[] = [];
      for (const task of tasks) {
        if (task.tags.length === 0) untagged.push(task);
        for (const tag of task.tags) {
          const group = groups.get(tag.id) ?? {
            id: tag.id,
            label: tagNames?.get(tag.id) ?? tag.name,
            tasks: [],
          };
          group.tasks.push(task);
          groups.set(tag.id, group);
        }
      }
      const result = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
      if (untagged.length > 0) result.push({ id: 'none', label: 'No tag', tasks: untagged });
      return result;
    }
  }
}

/** The filter as URL search params (only what is set), and back. */
export interface TaskSearch {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  tag?: string[];
  due?: DueFilter;
  archived?: boolean;
  group?: GroupKey;
  sort?: SortKey;
  /** The task whose details are open. */
  task?: string;
}

export function filtersFromSearch(search: TaskSearch): TaskFilters {
  return {
    status: search.status,
    priority: search.priority,
    tagIds: search.tag,
    due: search.due,
    archived: search.archived,
  };
}

export function searchFromFilters(filters: TaskFilters): TaskSearch {
  const search: TaskSearch = {};
  if (filters.status?.length) search.status = filters.status;
  if (filters.priority?.length) search.priority = filters.priority;
  if (filters.tagIds?.length) search.tag = filters.tagIds;
  if (filters.due && filters.due !== 'any') search.due = filters.due;
  if (filters.archived) search.archived = true;
  return search;
}
