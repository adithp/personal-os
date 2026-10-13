import type {
  CreateTaskInput,
  MoveTaskInput,
  Tag,
  ListTasksInput,
  Task,
  TaskStatus,
  TaskWriteResult,
  UndoDescriptor,
  UpdateTaskInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, type RequestOptions } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { startOfIstDay } from './dates';
import { GOALS_KEY } from './query-keys';

/**
 * Server data for the Tasks module (the hook signatures are part of the Feature 1 contract).
 * Every cached task list or task starts with the TASKS_KEY, so one invalidation refreshes them all.
 * Changes show up at once and are rolled back with a message if the server refuses.
 */
export const TASKS_KEY = ['tasks'] as const;
/** Every cached tag list starts with this key (see tags-queries.ts). */
export const TAGS_KEY = ['tags'] as const;
export const taskKeys = {
  all: TASKS_KEY,
  lists: [...TASKS_KEY, 'list'] as const,
  list: (input: ListTasksInput) => [...TASKS_KEY, 'list', input] as const,
  detail: (id: string) => [...TASKS_KEY, 'detail', id] as const,
};

export type TaskPatch = Omit<UpdateTaskInput, 'id'>;
export const OPEN_STATUSES: readonly TaskStatus[] = ['todo', 'doing'];

const text = (item: unknown): string =>
  typeof item === 'string' || typeof item === 'number' ? String(item) : '';

/** Query-string form of the list filters (numbers become text). */
function toQuery(input: ListTasksInput): RequestOptions['query'] {
  const query: Record<string, string | boolean | string[] | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) query[key] = value.map(text);
    else if (typeof value === 'boolean') query[key] = value;
    else query[key] = text(value);
  }
  return query;
}

/** Tasks matching the filters (the server's list action). */
export function useTasks(input: ListTasksInput = {}, options: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: taskKeys.list(input),
    queryFn: async () =>
      (await api.request<{ items: Task[] }>('GET', '/tasks', { query: toQuery(input) })).items,
    enabled: options.enabled ?? true,
  });
}

/** Top-level tasks that are not done, not archived. */
export function useOpenTasks() {
  return useTasks({ status: [...OPEN_STATUSES] });
}

/**
 * Tasks completed in the last `days` India days (default 7), or, with `before`, the ones completed
 * before that time (the "Show more" page). Day-aligned so the cache key is stable.
 */
export function useCompletedTasks(
  options: { days?: number; before?: string; enabled?: boolean } = {},
) {
  const { days = 7, before, enabled } = options;
  // Computed once per mount: the key stays stable while the screen is open
  const [after] = useState(() => startOfIstDay(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  return useTasks(
    before
      ? { status: 'done', completedBefore: before }
      : { status: 'done', completedAfter: after },
    { enabled },
  );
}

/** Archived top-level tasks. */
export function useArchivedTasks(options: { enabled?: boolean } = {}) {
  return useTasks({ archived: true }, options);
}

/** The subtasks of a task (one level only). */
export function useSubtasks(parentId: string | null) {
  return useTasks({ parent: parentId ?? 'none' }, { enabled: parentId !== null });
}

/** One task, fresh from the server (the detail panel uses this). */
export function useTask(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: taskKeys.detail(id ?? ''),
    queryFn: async () => (await api.request<{ item: Task }>('GET', `/tasks/${id ?? ''}`)).item,
    enabled: id !== null,
  });
}

/** What a task should look like right after a change, before the server has answered. */
export function applyPatch(
  task: Task,
  patch: TaskPatch,
  now: string,
  knownTags: readonly Tag[] = [],
): Task {
  const next: Task = { ...task };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt;
  if (patch.dueAllDay !== undefined) next.dueAllDay = patch.dueAllDay;
  if (patch.position !== undefined) next.position = patch.position;
  if (patch.recurrenceRule !== undefined) next.recurrenceRule = patch.recurrenceRule;
  if (patch.reminderAt !== undefined) next.reminderAt = patch.reminderAt;
  if (patch.tagIds !== undefined) {
    // Tags show at once; one the cache does not know yet appears after the refetch
    next.tags = patch.tagIds.flatMap((id) => {
      const tag = knownTags.find((candidate) => candidate.id === id);
      return tag ? [{ id: tag.id, name: tag.name, color: tag.color }] : [];
    });
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    next.status = patch.status;
    next.completedAt = patch.status === 'done' ? now : null;
  }
  return next;
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

type Snapshot = [readonly unknown[], unknown][];

/**
 * Changes one task in every cached list and in its detail cache; returns what to put back. Only
 * the cache entries that contain this task are saved and restored, so a failed change to one task
 * never rolls back a later change to another.
 */
function patchEverywhere(
  client: QueryClient,
  id: string,
  change: (task: Task) => Task | null,
): Snapshot {
  const has = (data: Task[] | Task | undefined) =>
    Array.isArray(data) ? data.some((task) => task.id === id) : data?.id === id;
  const snapshot: Snapshot = client
    .getQueriesData<Task[] | Task>({ queryKey: TASKS_KEY })
    .filter(([, data]) => has(data))
    .map(([key, data]) => [key, data]);
  client.setQueriesData<Task[] | Task>({ queryKey: TASKS_KEY }, (data) => {
    if (Array.isArray(data)) {
      return data.flatMap((task) => {
        if (task.id !== id) return [task];
        const next = change(task);
        return next ? [next] : [];
      });
    }
    if (data && data.id === id) return change(data) ?? data;
    return data;
  });
  return snapshot;
}

function restore(client: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) client.setQueryData(key, data);
}

/** Everything the Tasks screens can do to tasks. Complete, delete, and archive offer an Undo toast. */
export function useTaskActions() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: TASKS_KEY }),
      client.invalidateQueries({ queryKey: GOALS_KEY }),
    ]);
  };

  const runUndo = async (descriptor: UndoDescriptor) => {
    try {
      await api.request('POST', '/undo', { body: descriptor });
      await refresh();
    } catch (error) {
      toast().show(messageOf(error), { tone: 'error' });
    }
  };

  const offerUndo = (message: string, undo: UndoDescriptor | null) => {
    if (!undo) return;
    toast().show(message, {
      action: {
        label: 'Undo',
        onClick: () => {
          void runUndo(undo);
        },
      },
    });
  };

  const fail = (error: unknown, snapshot?: Snapshot) => {
    restore(client, snapshot);
    toast().show(messageOf(error), { tone: 'error' });
  };

  const create = useMutation({
    mutationFn: (input: CreateTaskInput) =>
      api.request<TaskWriteResult>('POST', '/tasks', { body: input }),
    onSuccess: () => refresh(),
    onError: (error) => {
      fail(error);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateTaskInput) =>
      api.request<TaskWriteResult>('PATCH', `/tasks/${id}`, { body: patch }),
    onMutate: async ({ id, ...patch }) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      const now = new Date().toISOString();
      const known = client.getQueryData<Tag[]>(TAGS_KEY) ?? [];
      return {
        snapshot: patchEverywhere(client, id, (task) => applyPatch(task, patch, now, known)),
      };
    },
    onError: (error, _input, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.request<TaskWriteResult>('POST', `/tasks/${id}/complete`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      const now = new Date().toISOString();
      return {
        snapshot: patchEverywhere(client, id, (task) => applyPatch(task, { status: 'done' }, now)),
      };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Task completed.', undo);
    },
    onError: (error, _id, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.request<TaskWriteResult>('DELETE', `/tasks/${id}`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      return { snapshot: patchEverywhere(client, id, () => null) };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Task deleted.', undo);
    },
    onError: (error, _id, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });

  /**
   * Drag and drop. `position` is only for showing the move at once (the server works out the real
   * one). Shows an Undo toast; a refused move rolls back and shows the server's message.
   */
  const move = useMutation({
    mutationFn: ({ input: { id, ...body } }: { input: MoveTaskInput; position?: number }) =>
      api.request<TaskWriteResult>('POST', `/tasks/${id}/move`, { body }),
    onMutate: async ({ input, position }) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      const now = new Date().toISOString();
      const patch: TaskPatch = {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.dueAllDay !== undefined ? { dueAllDay: input.dueAllDay } : {}),
        ...(position !== undefined ? { position } : {}),
      };
      return {
        snapshot: patchEverywhere(client, input.id, (task) => applyPatch(task, patch, now)),
      };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Task moved.', undo);
    },
    onError: (error, _input, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });

  /** Replace a task's tags (the Inbox gives a task its first tag). Offers Undo: the task leaves the list at once. */
  const setTags = useMutation({
    mutationFn: ({ id, tagIds }: { id: string; tagIds: string[] }) =>
      api.request<TaskWriteResult>('PATCH', `/tasks/${id}`, { body: { tagIds } }),
    onMutate: async ({ id, tagIds }) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      const now = new Date().toISOString();
      const known = client.getQueryData<Tag[]>(TAGS_KEY) ?? [];
      return {
        snapshot: patchEverywhere(client, id, (task) => applyPatch(task, { tagIds }, now, known)),
      };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Tag added.', undo);
    },
    onError: (error, _input, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });

  /** Make `blockerId` block the task (the detail panel's "Blocked by" row). */
  const addBlocker = useMutation({
    mutationFn: ({ id, blockerId }: { id: string; blockerId: string }) =>
      api.request<TaskWriteResult>('POST', `/tasks/${id}/blockers`, { body: { blockerId } }),
    onSuccess: ({ undo }) => {
      offerUndo('Blocker added.', undo);
    },
    onError: (error) => {
      fail(error);
    },
    onSettled: () => refresh(),
  });

  const removeBlocker = useMutation({
    mutationFn: ({ id, blockerId }: { id: string; blockerId: string }) =>
      api.request<TaskWriteResult>('DELETE', `/tasks/${id}/blockers/${blockerId}`),
    onSuccess: ({ undo }) => {
      offerUndo('Blocker removed.', undo);
    },
    onError: (error) => {
      fail(error);
    },
    onSettled: () => refresh(),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.request<TaskWriteResult>('POST', `/tasks/${id}/archive`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      return { snapshot: patchEverywhere(client, id, () => null) };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Task archived.', undo);
    },
    onError: (error, _id, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });

  const unarchive = useMutation({
    mutationFn: (id: string) => api.request<TaskWriteResult>('POST', `/tasks/${id}/unarchive`),
    onSuccess: () => refresh(),
    onError: (error) => {
      fail(error);
    },
  });

  return {
    create,
    update,
    complete,
    move,
    setTags,
    addBlocker,
    removeBlocker,
    remove,
    archive,
    unarchive,
  };
}
