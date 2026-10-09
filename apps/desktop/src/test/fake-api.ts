import type { Tag, Task, UndoDescriptor } from '@personal-os/shared';
import { nextTagColor } from '@personal-os/shared';
import { vi } from 'vitest';
import { ApiError, type ApiClient, type RequestOptions } from '../api/api-client';
import { positionBetween } from '../modules/tasks/drag/position';

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
export function createFakeApi(initial: Task[] = [], initialTags: Tag[] = []) {
  const store = new Map<string, Task>(initial.map((task) => [task.id, task]));
  const tagStore = new Map<string, Tag>(initialTags.map((tag) => [tag.id, tag]));
  const deleted = new Set<string>();
  const calls: Call[] = [];
  let failure: ApiError | null = null;
  let delayMs = 0;

  /** Blocked task id -> the ids of the tasks that block it. */
  const blockers = new Map<string, Set<string>>();

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

    return liveTasks()
      .filter((task) => {
        if (parent === 'none' ? task.parentTaskId !== null : task.parentTaskId !== parent) {
          return false;
        }
        if (archived !== (task.archivedAt !== null)) return false;
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

    if (method === 'GET' && path === '/tasks') return { items: list(options.query) };

    if (method === 'POST' && path === '/tasks') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title === '') throw new ApiError(400, 'validation_error', 'Title is required');
      if (typeof body.parentTaskId === 'string') {
        const parent = find(body.parentTaskId);
        if (parent.parentTaskId !== null) {
          throw new ApiError(400, 'validation_error', 'Subtasks go one level deep only');
        }
      }
      const { tagIds, ...rest } = body;
      const task = makeTask({ ...(rest as Partial<Task>), title, tags: tagRefs(tagIds) });
      store.set(task.id, task);
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

    if (method === 'GET' && path === '/tags') return { items: [...tagStore.values()] };
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
      if (failure) {
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
    /** The next call fails with this error (only once). */
    failNext: (status: number, code: string, message: string) => {
      failure = new ApiError(status, code, message);
    },
    /** Every call waits this long first (to look at the screen before the server answers). */
    slow: (ms: number) => {
      delayMs = ms;
    },
    softDeleted: () => [...deleted],
  };
}

export type FakeApi = ReturnType<typeof createFakeApi>;
