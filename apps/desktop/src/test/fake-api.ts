import type {
  Favorite,
  Goal,
  GoalStatus,
  FavoriteView,
  Note,
  NoteFolder,
  ReportPeriod,
  Tag,
  Task,
  TaskReport,
  UndoDescriptor,
} from '@personal-os/shared';
import {
  MAX_FAVORITES,
  nextTagColor,
  removeTagFromView,
  replaceTagInView,
  sameFavoriteView,
} from '@personal-os/shared';
import { vi } from 'vitest';
import { ApiError, type ApiClient, type RequestOptions } from '../api/api-client';
import { positionBetween } from '../modules/tasks/drag/position';
import { createNoteTemplatesFake } from './fake-note-templates';
import { createNotesFake, NOT_NOTES } from './fake-notes';

export { makeFolder, makeNote } from './fake-notes';

let counter = 0;
const idFor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A task with sensible defaults; ids look like real uuids. */
export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: idFor(counter),
    title: `Task ${String(counter)}`,
    description: null,
    status: 'todo',
    priority: 4,
    dueAt: null,
    dueAllDay: false,
    reminderAt: null,
    recurrenceRule: null,
    parentTaskId: null,
    position: counter * 1024,
    completedAt: null,
    archivedAt: null,
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    tags: [],
    subtaskCount: 0,
    subtasksDone: 0,
    blockedBy: [],
    goal: null,
    ...overrides,
  };
}

/** A tag with defaults. */
export function makeTag(overrides: Partial<Tag> = {}): Tag {
  counter += 1;
  return {
    id: idFor(counter),
    name: `tag${String(counter)}`,
    color: '#F7D96B',
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
  query?: RequestOptions['query'];
}

const asArray = (value: unknown): string[] =>
  value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(String);

/**
 * A stand-in for the backend that keeps tasks and tags in memory and follows the same rules as the
 * real routes: soft delete, archive, subtasks (one level), tags, counts, filters, undo descriptors,
 * and completedAt. Tests read `calls` and `tasks`. (Dependencies and recurrence arrive in Feature 3.)
 */
/** An empty report for a period (a Monday-to-Sunday week or a 31-day month); override what a test needs. */
export function makeReport(
  period: ReportPeriod = 'week',
  overrides: Partial<TaskReport> = {},
): TaskReport {
  const zero = { done: 0, onTime: 0, late: 0, noDueDate: 0 };
  const length = period === 'week' ? 7 : 31;
  const days = Array.from({ length }, (_, index) => ({
    date: `2025-10-${String(period === 'week' ? 6 + index : 1 + index).padStart(2, '0')}`,
    ...zero,
  }));
  return {
    period,
    timeZone: 'Asia/Kolkata',
    today: '2025-10-07',
    start: days[0]?.date ?? '2025-10-06',
    end: days.at(-1)?.date ?? '2025-10-12',
    days,
    totals: { ...zero, added: 0 },
    previous: { ...zero, added: 0, start: '2025-09-29', end: '2025-09-30' },
    overdueNow: 0,
    byTag: [],
    otherTagsDone: 0,
    noTagDone: 0,
    hasEverDone: true,
    ...overrides,
  };
}

/** A goal with sensible defaults (progress is worked out by the mock API from its tasks). */
export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  counter += 1;
  return {
    id: idFor(counter + 9000),
    title: `Goal ${String(counter)}`,
    description: null,
    targetAt: null,
    status: 'active',
    closedAt: null,
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    progress: { done: 0, total: 0 },
    ...overrides,
  };
}

export function makeFavorite(overrides: Partial<Favorite> = {}): Favorite {
  counter += 1;
  return {
    id: idFor(counter + 5000),
    name: `Favorite ${String(counter)}`,
    color: '#F7D96B',
    icon: 'hash',
    view: { priority: [1] },
    position: counter * 1024,
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createFakeApi(
  initial: Task[] = [],
  initialTags: Tag[] = [],
  initialFavorites: Favorite[] = [],
  initialGoals: Goal[] = [],
  initialNotes: Note[] = [],
  initialFolders: NoteFolder[] = [],
) {
  const notesFake = createNotesFake(initialNotes, initialFolders);
  const templatesFake = createNoteTemplatesFake(notesFake);
  const store = new Map<string, Task>(initial.map((task) => [task.id, task]));
  const tagStore = new Map<string, Tag>(initialTags.map((tag) => [tag.id, tag]));
  const deleted = new Set<string>();
  const favoriteStore = new Map<string, Favorite>(
    initialFavorites.map((favorite) => [favorite.id, favorite]),
  );
  const favoritesGone = new Set<string>();
  const goalStore = new Map<string, Goal>(initialGoals.map((goal) => [goal.id, goal]));
  const goalsGone = new Set<string>();
  /** Task id -> the id of its goal. A task with a goal in `initial` (task.goal) is linked at start. */
  const taskGoal = new Map<string, string>(
    initial.flatMap((task) => (task.goal ? [[task.id, task.goal.id] as [string, string]] : [])),
  );
  /** Tags removed by delete or merge, kept for the undo. */
  const removedTags = new Map<string, Tag>();
  const calls: Call[] = [];
  let failure: ApiError | null = null;
  /** true: any request; a string: only paths that start with it; false: any except favorites. */
  let failureTarget: boolean | string = false;
  /** What GET /tasks/report answers; tests set it with setReport. */
  let reportOverride: TaskReport | null = null;
  let delayMs = 0;

  /** Blocked task id -> the ids of the tasks that block it. */
  const blockers = new Map<string, Set<string>>();

  const liveGoals = () => [...goalStore.values()].filter((goal) => !goalsGone.has(goal.id));

  /** done and total over the goal's linked, live, top-level tasks that are not archived (or are done). */
  const goalProgress = (goalId: string) => {
    const counted = [...taskGoal.entries()]
      .filter(([, linked]) => linked === goalId)
      .flatMap(([taskId]) => {
        const task = store.get(taskId);
        return task && !deleted.has(taskId) && task.parentTaskId === null ? [task] : [];
      })
      .filter((task) => task.archivedAt === null || task.status === 'done');
    return { done: counted.filter((task) => task.status === 'done').length, total: counted.length };
  };
  const goalView = (goal: Goal): Goal => ({ ...goal, progress: goalProgress(goal.id) });
  const findGoal = (id: string) => {
    const goal = goalStore.get(id);
    if (!goal || goalsGone.has(id)) throw new ApiError(404, 'not_found', 'Goal not found');
    return goal;
  };

  const liveFavorites = () =>
    [...favoriteStore.values()]
      .filter((fav) => !favoritesGone.has(fav.id))
      .sort((a, b) => a.position - b.position);

  const liveTasks = () => [...store.values()].filter((task) => !deleted.has(task.id));

  /** The blockers of a task that are not done, as the API returns them. */
  const unfinishedBlockers = (id: string): Task['blockedBy'] =>
    [...(blockers.get(id) ?? [])].flatMap((blockerId) => {
      const blocker = store.get(blockerId);
      return blocker && !deleted.has(blockerId) && blocker.status !== 'done'
        ? [{ id: blocker.id, title: blocker.title }]
        : [];
    });

  /** The task as the API returns it: with its subtask counts. */
  const view = (task: Task): Task => {
    const children = liveTasks().filter((child) => child.parentTaskId === task.id);
    return {
      ...task,
      subtaskCount: children.length,
      subtasksDone: children.filter((child) => child.status === 'done').length,
      goal: (() => {
        const goal = goalStore.get(taskGoal.get(task.id) ?? '');
        return goal && !goalsGone.has(goal.id) ? { id: goal.id, title: goal.title } : null;
      })(),
      // Blockers added through the API are live; a task made with blockedBy keeps its fixed list
      blockedBy: blockers.has(task.id) ? unfinishedBlockers(task.id) : task.blockedBy,
    };
  };

  const find = (id: string) => {
    const task = store.get(id);
    if (!task || deleted.has(id)) throw new ApiError(404, 'not_found', 'Task not found');
    return task;
  };

  const tagRefs = (ids: unknown): Task['tags'] =>
    asArray(ids).flatMap((id) => {
      const tag = tagStore.get(id);
      return tag ? [{ id: tag.id, name: tag.name, color: tag.color }] : [];
    });

  const patchTask = (id: string, patch: Record<string, unknown>) => {
    const current = find(id);
    if (patch.status === 'done' && current.status !== 'done') {
      const open = unfinishedBlockers(id);
      if (open.length > 0) {
        throw new ApiError(409, 'blocked', `Blocked by: ${open.map((b) => b.title).join(', ')}`);
      }
    }
    const previous: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || value === undefined) continue;
      previous[key] =
        key === 'tagIds'
          ? current.tags.map((tag) => tag.id)
          : (current as unknown as Record<string, unknown>)[key];
    }
    const { tagIds, ...rest } = patch;
    const next = { ...current, ...rest, id };
    if (tagIds !== undefined) next.tags = tagRefs(tagIds);
    if (typeof patch.status === 'string' && patch.status !== current.status) {
      next.completedAt = patch.status === 'done' ? new Date().toISOString() : null;
    }
    store.set(id, next);
    const undo: UndoDescriptor = { action: 'tasks.update', input: { id, ...previous } };
    return { item: view(next), undo };
  };

  const list = (query: RequestOptions['query'] = {}) => {
    const statuses = asArray(query.status);
    const priorities = asArray(query.priority).map(Number);
    const tagIds = asArray(query.tagId);
    const parent = query.parent === undefined ? 'none' : String(query.parent);
    const archived = query.archived === true || query.archived === 'true';
    const noDate = query.noDate === true || query.noDate === 'true';
    const after = query.completedAfter ? Date.parse(String(query.completedAfter)) : null;
    const before = query.completedBefore ? Date.parse(String(query.completedBefore)) : null;
    const from = query.dueFrom ? Date.parse(String(query.dueFrom)) : null;
    const to = query.dueTo ? Date.parse(String(query.dueTo)) : null;
    const limit = query.limit === undefined ? 500 : Number(query.limit);
    const goalId = query.goalId === undefined ? null : String(query.goalId);

    return liveTasks()
      .filter((task) => {
        if (parent === 'none' ? task.parentTaskId !== null : task.parentTaskId !== parent) {
          return false;
        }
        if (goalId !== null) {
          if (taskGoal.get(task.id) !== goalId) return false;
        } else if (archived !== (task.archivedAt !== null)) {
          return false;
        }
        if (statuses.length && !statuses.includes(task.status)) return false;
        if (priorities.length && !priorities.includes(task.priority)) return false;
        if (tagIds.length && !task.tags.some((tag) => tagIds.includes(tag.id))) return false;
        if (noDate && task.dueAt !== null) return false;
        if (from !== null && (task.dueAt === null || Date.parse(task.dueAt) < from)) return false;
        if (to !== null && (task.dueAt === null || Date.parse(task.dueAt) >= to)) return false;
        const done = task.completedAt ? Date.parse(task.completedAt) : null;
        if (after !== null && (done === null || done < after)) return false;
        if (before !== null && (done === null || done >= before)) return false;
        return true;
      })
      .sort((a, b) => a.position - b.position)
      .slice(0, limit)
      .map(view);
  };

  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = (options.body ?? {}) as Record<string, unknown>;

    const noteAnswer = templatesFake.handle(method, path, options);
    if (noteAnswer !== NOT_NOTES) return noteAnswer;

    if (method === 'GET' && path === '/tasks/report') {
      const period = options.query?.period === 'month' ? 'month' : 'week';
      return { item: reportOverride?.period === period ? reportOverride : makeReport(period) };
    }
    if (method === 'GET' && path === '/tasks') return { items: list(options.query) };

    // Keyword search: every typed word is the start of a word in the title or description
    if (method === 'POST' && path === '/search') {
      const q = typeof body.q === 'string' ? body.q.trim() : '';
      if (q === '') throw new ApiError(400, 'validation_error', 'Type something to search');
      const limit = typeof body.limit === 'number' ? body.limit : 5;
      const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
      const typed = wordsOf(q);
      const matches = (text: string | null) =>
        text !== null &&
        typed.length > 0 &&
        typed.every((word) => wordsOf(text).some((w) => w.startsWith(word)));
      const taskHits = liveTasks()
        .filter((task) => matches(`${task.title} ${task.description ?? ''}`))
        .slice(0, limit)
        .map((task) => ({
          type: 'task' as const,
          id: task.id,
          title: task.title,
          snippet: !matches(task.title) && task.description ? task.description : null,
          status: task.status,
          dueAt: task.dueAt,
          dueAllDay: task.dueAllDay,
          archived: task.archivedAt !== null,
          parentTaskId: task.parentTaskId,
        }));
      const tagHits =
        typed.length === 1
          ? [...tagStore.values()]
              .filter((tag) => tag.name.toLowerCase().startsWith(q.replace(/^#/, '').toLowerCase()))
              .slice(0, limit)
              .map((tag) => ({
                type: 'tag' as const,
                id: tag.id,
                title: tag.name,
                snippet: null,
                color: tag.color,
              }))
          : [];
      const groups = [
        { type: 'task' as const, items: taskHits },
        { type: 'tag' as const, items: tagHits },
      ].filter((group) => group.items.length > 0);
      return { item: { q, groups } };
    }

    if (method === 'POST' && path === '/tasks') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title === '') throw new ApiError(400, 'validation_error', 'Title is required');
      if (typeof body.parentTaskId === 'string') {
        const parent = find(body.parentTaskId);
        if (parent.parentTaskId !== null) {
          throw new ApiError(400, 'validation_error', 'Subtasks go one level deep only');
        }
      }
      const { tagIds, tagNames, goalId, ...rest } = body;
      // Tags by name are found (ignoring capitals) or created, like POST /tags
      const named = asArray(tagNames).map((name) => {
        const existing = [...tagStore.values()].find(
          (tag) => tag.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) return existing.id;
        const tag = makeTag({ name, color: nextTagColor(tagStore.size) });
        tagStore.set(tag.id, tag);
        return tag.id;
      });
      const task = makeTask({
        ...(rest as Partial<Task>),
        title,
        tags: tagRefs([...new Set([...asArray(tagIds), ...named])]),
      });
      store.set(task.id, task);
      if (typeof goalId === 'string') taskGoal.set(task.id, findGoal(goalId).id);
      return { item: view(task), undo: { action: 'tasks.delete', input: { id: task.id } } };
    }

    const blockerRoute = /^\/tasks\/([^/]+)\/blockers(?:\/([^/]+))?$/.exec(path);
    if (blockerRoute) {
      const id = blockerRoute[1] ?? '';
      const blockerId =
        blockerRoute[2] ?? (typeof body.blockerId === 'string' ? body.blockerId : '');
      find(id);
      find(blockerId);
      const set = blockers.get(id) ?? new Set<string>();
      if (method === 'POST') {
        // A task cannot block itself, and no cycle is allowed (A blocks B blocks A, or longer)
        const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
          if (from === to) return true;
          if (seen.has(from)) return false;
          seen.add(from);
          return [...blockers.entries()].some(
            ([blocked, by]) => by.has(from) && reaches(blocked, to, seen),
          );
        };
        if (id === blockerId || reaches(id, blockerId)) {
          throw new ApiError(
            409,
            'circular_dependency',
            'That would make the tasks wait for each other',
          );
        }
        set.add(blockerId);
        blockers.set(id, set);
        return {
          item: view(find(id)),
          undo: { action: 'tasks.removeBlocker', input: { id, blockerId } },
        };
      }
      if (method === 'DELETE') {
        set.delete(blockerId);
        return {
          item: view(find(id)),
          undo: { action: 'tasks.addBlocker', input: { id, blockerId } },
        };
      }
    }

    const one = /^\/tasks\/([^/]+)(?:\/(complete|archive|unarchive|move))?$/.exec(path);
    if (one) {
      const id = one[1] ?? '';
      const verb = one[2];
      if (method === 'GET' && !verb) return { item: view(find(id)) };
      if (method === 'PATCH' && !verb) return patchTask(id, body);
      if (method === 'POST' && verb === 'complete') return patchTask(id, { status: 'done' });
      if (method === 'POST' && verb === 'move') {
        // The place between the neighbours (afterId above, beforeId below); the rest is a plain update
        const { afterId, beforeId, ...rest } = body;
        const above = typeof afterId === 'string' ? find(afterId).position : undefined;
        const below = typeof beforeId === 'string' ? find(beforeId).position : undefined;
        const position =
          above === undefined && below === undefined ? undefined : positionBetween(above, below);
        return patchTask(id, { ...rest, ...(position === undefined ? {} : { position }) });
      }
      if (method === 'POST' && verb === 'archive') {
        const current = find(id);
        store.set(id, { ...current, archivedAt: new Date().toISOString() });
        return { item: view(find(id)), undo: { action: 'tasks.unarchive', input: { id } } };
      }
      if (method === 'POST' && verb === 'unarchive') {
        const current = find(id);
        store.set(id, { ...current, archivedAt: null });
        return { item: view(find(id)), undo: { action: 'tasks.archive', input: { id } } };
      }
      if (method === 'DELETE' && !verb) {
        const item = view(find(id));
        deleted.add(id);
        return { item, undo: { action: 'tasks.restore', input: { id } } };
      }
    }

    if (method === 'GET' && path === '/tags') {
      return {
        items: [...tagStore.values()].map((tag) => ({
          ...tag,
          taskCount: liveTasks().filter((task) => task.tags.some((ref) => ref.id === tag.id))
            .length,
          favoriteCount: liveFavorites().filter((fav) => fav.view.tagIds?.includes(tag.id)).length,
        })),
      };
    }

    // ---- goals ----
    if (method === 'GET' && path === '/goals') {
      const status = options.query?.status;
      return {
        items: liveGoals()
          .filter((goal) => status === undefined || goal.status === status)
          .map(goalView),
      };
    }
    if (method === 'POST' && path === '/goals') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title === '') throw new ApiError(400, 'validation_error', 'Title is required');
      const goal = makeGoal({
        title,
        description: typeof body.description === 'string' ? body.description : null,
        targetAt: typeof body.targetAt === 'string' ? body.targetAt : null,
      });
      goalStore.set(goal.id, goal);
      return { item: goalView(goal), undo: { action: 'goals.delete', input: { id: goal.id } } };
    }
    const goalRoute = /^\/goals\/([^/]+)(?:\/(status))?$/.exec(path);
    if (goalRoute) {
      const id = goalRoute[1] ?? '';
      const current = findGoal(id);
      if (method === 'GET' && !goalRoute[2]) return { item: goalView(current) };
      if (method === 'PATCH' && !goalRoute[2]) {
        const next = { ...current, ...(body as Partial<Goal>), id };
        goalStore.set(id, next);
        return {
          item: goalView(next),
          undo: {
            action: 'goals.update',
            input: {
              id,
              title: current.title,
              description: current.description,
              targetAt: current.targetAt,
            },
          },
        };
      }
      if (method === 'POST' && goalRoute[2] === 'status') {
        const status = body.status as GoalStatus;
        if (status === current.status) return { item: goalView(current), undo: null };
        const closedAt =
          'closedAt' in body
            ? (body.closedAt as string | null)
            : status === 'active'
              ? null
              : new Date().toISOString();
        goalStore.set(id, { ...current, status, closedAt });
        return {
          item: goalView(goalStore.get(id) ?? current),
          undo: {
            action: 'goals.setStatus',
            input: { id, status: current.status, closedAt: current.closedAt },
          },
        };
      }
      if (method === 'DELETE') {
        goalsGone.add(id);
        return { item: goalView(current), undo: { action: 'goals.restore', input: { id } } };
      }
    }
    const taskGoalRoute = /^\/tasks\/([^/]+)\/goal$/.exec(path);
    if (method === 'PUT' && taskGoalRoute) {
      const taskId = taskGoalRoute[1] ?? '';
      const task = find(taskId);
      if (task.parentTaskId !== null) {
        throw new ApiError(400, 'validation_error', 'Link the parent task instead.');
      }
      const before = taskGoal.get(taskId) ?? null;
      const goalId = typeof body.goalId === 'string' ? findGoal(body.goalId).id : null;
      if (goalId === before) return { item: goalView(findGoal(goalId ?? '')), undo: null };
      if (goalId === null) taskGoal.delete(taskId);
      else taskGoal.set(taskId, goalId);
      const shown = goalId ?? before ?? '';
      return {
        item: goalView(goalStore.get(shown) ?? makeGoal()),
        undo: { action: 'goals.setTaskGoal', input: { taskId, goalId: before } },
      };
    }

    // ---- favorites ----
    if (method === 'GET' && path === '/task-favorites') return { items: liveFavorites() };
    if (method === 'POST' && path === '/task-favorites') {
      const view = body.view as FavoriteView;
      const same = liveFavorites().find((fav) => sameFavoriteView(fav.view, view));
      if (same) return { item: same, undo: null };
      if (liveFavorites().length >= MAX_FAVORITES) {
        throw new ApiError(409, 'favorites_limit', 'You can have at most 12 favorites');
      }
      const last = liveFavorites().at(-1);
      const favorite = makeFavorite({
        name: String(body.name),
        view,
        color: typeof body.color === 'string' ? body.color : nextTagColor(favoriteStore.size),
        icon: (typeof body.icon === 'string' ? body.icon : 'hash') as Favorite['icon'],
        position: (last?.position ?? 0) + 1024,
      });
      favoriteStore.set(favorite.id, favorite);
      return { item: favorite, undo: { action: 'favorites.delete', input: { id: favorite.id } } };
    }
    const favoriteRoute = /^\/task-favorites\/([^/]+)(?:\/(move))?$/.exec(path);
    if (favoriteRoute) {
      const id = favoriteRoute[1] ?? '';
      const current = favoriteStore.get(id);
      if (!current || favoritesGone.has(id))
        throw new ApiError(404, 'not_found', 'Favorite not found');
      if (method === 'PATCH') {
        const next = { ...current, ...(body as Partial<Favorite>), id };
        favoriteStore.set(id, next);
        return {
          item: next,
          undo: {
            action: 'favorites.update',
            input: { id, name: current.name, color: current.color, icon: current.icon },
          },
        };
      }
      if (method === 'POST' && favoriteRoute[2] === 'move') {
        const above =
          typeof body.afterId === 'string' ? favoriteStore.get(body.afterId)?.position : undefined;
        const below =
          typeof body.beforeId === 'string'
            ? favoriteStore.get(body.beforeId)?.position
            : undefined;
        const position = positionBetween(above, below);
        favoriteStore.set(id, { ...current, position });
        return { item: favoriteStore.get(id), undo: null };
      }
      if (method === 'DELETE') {
        favoritesGone.add(id);
        return { item: current, undo: { action: 'favorites.restore', input: { id } } };
      }
    }

    // ---- deleting and merging tags ----
    const tagMerge = /^\/tags\/([^/]+)\/merge$/.exec(path);
    const tagDelete = /^\/tags\/([^/]+)$/.exec(path);
    if ((method === 'DELETE' && tagDelete) || (method === 'POST' && tagMerge)) {
      const id = (tagMerge ?? tagDelete)?.[1] ?? '';
      const tag = tagStore.get(id);
      if (!tag) throw new ApiError(404, 'not_found', 'Tag not found');
      const target = tagMerge ? tagStore.get(String(body.targetId)) : undefined;
      if (tagMerge && !target) throw new ApiError(404, 'not_found', 'Tag not found');
      const taskIds = liveTasks()
        .filter((task) => task.tags.some((ref) => ref.id === id))
        .map((task) => task.id);
      for (const taskId of taskIds) {
        const task = find(taskId);
        const kept = task.tags.filter((ref) => ref.id !== id);
        const tags =
          target && !kept.some((ref) => ref.id === target.id)
            ? [...kept, { id: target.id, name: target.name, color: target.color }]
            : kept;
        store.set(taskId, { ...task, tags });
      }
      const touched: { id: string; view: FavoriteView; removed: boolean }[] = [];
      for (const fav of liveFavorites()) {
        if (!fav.view.tagIds?.includes(id)) continue;
        const next = target
          ? replaceTagInView(fav.view, id, target.id)
          : removeTagFromView(fav.view, id);
        if (next === null) {
          favoritesGone.add(fav.id);
          touched.push({ id: fav.id, view: fav.view, removed: true });
        } else {
          favoriteStore.set(fav.id, { ...fav, view: next });
          touched.push({ id: fav.id, view: fav.view, removed: false });
        }
      }
      tagStore.delete(id);
      removedTags.set(id, tag);
      const input = { id, taskIds, favorites: touched };
      return target
        ? {
            item: target,
            undo: {
              action: 'tags.unmerge',
              input: { sourceId: id, targetId: target.id, taskIds, favorites: touched },
            },
          }
        : { item: tag, undo: { action: 'tags.restore', input } };
    }
    if (method === 'POST' && path === '/tags') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name === '' || /[\s#]/.test(name)) {
        throw new ApiError(400, 'validation_error', 'A tag name has no spaces or # characters');
      }
      const existing = [...tagStore.values()].find(
        (tag) => tag.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) return { item: existing, undo: null };
      const tag = makeTag({
        name,
        color: typeof body.color === 'string' ? body.color : nextTagColor(tagStore.size),
      });
      tagStore.set(tag.id, tag);
      return { item: tag, undo: null };
    }
    const tagRoute = /^\/tags\/([^/]+)$/.exec(path);
    if (method === 'PATCH' && tagRoute) {
      const tag = tagStore.get(tagRoute[1] ?? '');
      if (!tag) throw new ApiError(404, 'not_found', 'Tag not found');
      const next = { ...tag, ...(body as Partial<Tag>), id: tag.id };
      tagStore.set(tag.id, next);
      // tasks carry their tags' names and colors
      for (const [id, task] of store) {
        store.set(id, {
          ...task,
          tags: task.tags.map((ref) =>
            ref.id === next.id ? { id: next.id, name: next.name, color: next.color } : ref,
          ),
        });
      }
      return {
        item: next,
        undo: { action: 'tags.update', input: { id: tag.id, name: tag.name, color: tag.color } },
      };
    }

    if (method === 'POST' && path === '/undo') {
      const { action, input } = body as { action: string; input: Record<string, unknown> };
      const id = String(input.id);
      if (action === 'goals.restore' || action === 'goals.delete') {
        if (action === 'goals.restore') goalsGone.delete(id);
        else goalsGone.add(id);
        return { item: goalStore.get(id), undo: null };
      }
      if (action === 'goals.update') return handle('PATCH', `/goals/${id}`, { body: input });
      if (action === 'goals.setStatus')
        return handle('POST', `/goals/${id}/status`, { body: input });
      if (action === 'goals.setTaskGoal') {
        return handle('PUT', `/tasks/${String(input.taskId)}/goal`, {
          body: { goalId: input.goalId },
        });
      }
      if (action === 'favorites.restore') {
        favoritesGone.delete(id);
        return { item: favoriteStore.get(id), undo: null };
      }
      if (action === 'favorites.delete') {
        favoritesGone.add(id);
        return { item: favoriteStore.get(id), undo: null };
      }
      if (action === 'favorites.update')
        return handle('PATCH', `/task-favorites/${id}`, { body: input });
      if (action === 'tags.restore' || action === 'tags.unmerge') {
        const tagId = String(action === 'tags.restore' ? input.id : input.sourceId);
        const tag = removedTags.get(tagId);
        if (!tag) throw new ApiError(404, 'not_found', 'Tag not found');
        tagStore.set(tagId, tag);
        const ref = { id: tag.id, name: tag.name, color: tag.color };
        for (const taskId of (input.taskIds as string[] | undefined) ?? []) {
          const task = store.get(taskId);
          if (task && !task.tags.some((entry) => entry.id === tagId)) {
            store.set(taskId, { ...task, tags: [...task.tags, ref] });
          }
        }
        for (const touched of (input.favorites as
          { id: string; view: FavoriteView; removed: boolean }[] | undefined) ?? []) {
          const fav = favoriteStore.get(touched.id);
          if (fav) favoriteStore.set(fav.id, { ...fav, view: touched.view });
          if (touched.removed) favoritesGone.delete(touched.id);
        }
        return { item: tag, undo: null };
      }
      if (action === 'tasks.update') return patchTask(id, input);
      if (action === 'tasks.restore') {
        deleted.delete(id);
        return { item: view(find(id)), undo: null };
      }
      if (action === 'tasks.delete') {
        const item = view(find(id));
        deleted.add(id);
        return { item, undo: null };
      }
      if (action === 'tasks.archive' || action === 'tasks.unarchive') {
        const verb = action === 'tasks.archive' ? 'archive' : 'unarchive';
        return handle('POST', `/tasks/${id}/${verb}`, {});
      }
    }
    throw new ApiError(404, 'not_found', 'Route not found');
  };

  const request = vi.fn(
    async <T>(method: string, path: string, options: RequestOptions = {}): Promise<T> => {
      calls.push({ method, path, body: options.body, query: options.query });
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      // The favorites list loads in the background of every Tasks page: it does not take the failure
      const aimed =
        typeof failureTarget === 'string'
          ? path.startsWith(failureTarget)
          : failureTarget || !path.startsWith('/task-favorites');
      if (failure && aimed) {
        const error = failure;
        failure = null;
        throw error;
      }
      return handle(method, path, options) as T;
    },
  );

  const api: ApiClient = { request: request as unknown as ApiClient['request'] };

  return {
    api,
    request,
    calls,
    /** The live tasks, in position order, as the API would return them (with counts). */
    tasks: () =>
      liveTasks()
        .sort((a, b) => a.position - b.position)
        .map(view),
    tags: () => [...tagStore.values()],
    /** Live notes (with text and revision), notes in Trash, and live folders. */
    notes: notesFake.notes,
    trashedNotes: notesFake.trashed,
    noteFolders: notesFake.folders,
    noteTemplates: templatesFake.templates,
    /** What GET /tasks/report answers for its period (other periods get an empty report). */
    setReport: (report: TaskReport) => {
      reportOverride = report;
    },
    /** The next call fails with this error (only once). Favorites requests are skipped unless anyPath. */
    failNext: (status: number, code: string, message: string, target: boolean | string = false) => {
      failure = new ApiError(status, code, message);
      failureTarget = target;
    },
    /** Every call waits this long first (to look at the screen before the server answers). */
    slow: (ms: number) => {
      delayMs = ms;
    },
    softDeleted: () => [...deleted],
  };
}

export type FakeApi = ReturnType<typeof createFakeApi>;
