import type { Task, UndoDescriptor } from '@personal-os/shared';
import { vi } from 'vitest';
import { ApiError, type ApiClient, type RequestOptions } from '../api/api-client';

let counter = 0;

/** A task with sensible defaults; ids look like real uuids. */
export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  return {
    id,
    title: `Task ${String(counter)}`,
    description: null,
    status: 'todo',
    priority: 4,
    dueAt: null,
    reminderAt: null,
    recurrenceRule: null,
    parentTaskId: null,
    position: counter * 1024,
    completedAt: null,
    archivedAt: null,
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * A stand-in for the backend that keeps tasks in memory and follows the same rules as the real
 * routes (soft delete, undo descriptors, completedAt). Tests read `calls` and `tasks`.
 */
export function createFakeApi(initial: Task[] = []) {
  const tasks = new Map<string, Task>(initial.map((task) => [task.id, task]));
  const deleted = new Set<string>();
  const calls: Call[] = [];
  let failure: ApiError | null = null;
  let delayMs = 0;

  const live = () => [...tasks.values()].filter((task) => !deleted.has(task.id));
  const find = (id: string) => {
    const task = tasks.get(id);
    if (!task || deleted.has(id)) throw new ApiError(404, 'not_found', 'Task not found');
    return task;
  };

  const patchTask = (id: string, patch: Record<string, unknown>) => {
    const current = find(id);
    const previous: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || value === undefined) continue;
      previous[key] = (current as unknown as Record<string, unknown>)[key];
    }
    const next = { ...current, ...patch, id };
    if (typeof patch.status === 'string' && patch.status !== current.status) {
      next.completedAt = patch.status === 'done' ? '2025-10-07T00:00:00.000Z' : null;
    }
    tasks.set(id, next);
    const undo: UndoDescriptor = { action: 'tasks.update', input: { id, ...previous } };
    return { item: next, undo };
  };

  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = (options.body ?? {}) as Record<string, unknown>;
    if (method === 'GET' && path === '/tasks') {
      return { items: live().sort((a, b) => a.position - b.position) };
    }
    if (method === 'POST' && path === '/tasks') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title === '') throw new ApiError(400, 'validation_error', 'Title is required');
      const task = makeTask({ ...(body as Partial<Task>), title });
      tasks.set(task.id, task);
      return { item: task, undo: { action: 'tasks.delete', input: { id: task.id } } };
    }
    const one = /^\/tasks\/([^/]+)(\/complete)?$/.exec(path);
    if (one) {
      const id = one[1] ?? '';
      if (method === 'GET') return { item: find(id) };
      if (method === 'PATCH') return patchTask(id, body);
      if (method === 'POST' && one[2]) return patchTask(id, { status: 'done' });
      if (method === 'DELETE') {
        const item = find(id);
        deleted.add(id);
        return { item, undo: { action: 'tasks.restore', input: { id } } };
      }
    }
    if (method === 'POST' && path === '/undo') {
      const { action, input } = body as { action: string; input: Record<string, unknown> };
      const id = String(input.id);
      if (action === 'tasks.update') return patchTask(id, input);
      if (action === 'tasks.restore') {
        deleted.delete(id);
        return { item: find(id), undo: null };
      }
      if (action === 'tasks.delete') {
        const item = find(id);
        deleted.add(id);
        return { item, undo: null };
      }
    }
    throw new ApiError(404, 'not_found', 'Route not found');
  };

  const request = vi.fn(
    async <T>(method: string, path: string, options: RequestOptions = {}): Promise<T> => {
      calls.push({ method, path, body: options.body });
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
    tasks: live,
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
