import type {
  CreateTaskInput,
  Task,
  TaskWriteResult,
  UndoDescriptor,
  UpdateTaskInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';

/** Every cached list of tasks starts with this key. */
export const TASKS_KEY = ['tasks'] as const;
const LIST_KEY = [...TASKS_KEY, 'list'] as const;

export type TaskPatch = Omit<UpdateTaskInput, 'id'>;

/** All active tasks, in list order. */
export function useTasks() {
  const api = useApi();
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => (await api.request<{ items: Task[] }>('GET', '/tasks')).items,
  });
}

/** What the list should look like right after a change, before the server has answered. */
function applyPatch(task: Task, patch: TaskPatch, now: string): Task {
  const next: Task = { ...task };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt;
  if (patch.reminderAt !== undefined) next.reminderAt = patch.reminderAt;
  if (patch.status !== undefined && patch.status !== task.status) {
    next.status = patch.status;
    next.completedAt = patch.status === 'done' ? now : null;
  }
  return next;
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/** Changes the cached list immediately; returns what to put back if the server says no. */
function patchList(client: QueryClient, change: (tasks: Task[]) => Task[]): Task[] | undefined {
  const previous = client.getQueryData<Task[]>(LIST_KEY);
  if (previous) client.setQueryData<Task[]>(LIST_KEY, change(previous));
  return previous;
}

/**
 * Everything the Tasks screen can do. Changes show up at once and are rolled back with a message
 * if the server refuses. Completing and deleting offer an Undo in a toast.
 */
export function useTaskActions() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = () => client.invalidateQueries({ queryKey: TASKS_KEY });

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

  const create = useMutation({
    mutationFn: (input: CreateTaskInput) =>
      api.request<TaskWriteResult>('POST', '/tasks', { body: input }),
    onSuccess: ({ item }) => {
      client.setQueryData<Task[]>(LIST_KEY, (tasks) => (tasks ? [...tasks, item] : [item]));
      void refresh();
    },
    onError: (error) => {
      toast().show(messageOf(error), { tone: 'error' });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateTaskInput) =>
      api.request<TaskWriteResult>('PATCH', `/tasks/${id}`, { body: patch }),
    onMutate: async ({ id, ...patch }) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      const now = new Date().toISOString();
      return {
        previous: patchList(client, (tasks) =>
          tasks.map((task) => (task.id === id ? applyPatch(task, patch, now) : task)),
        ),
      };
    },
    onError: (error, _input, context) => {
      if (context?.previous) client.setQueryData(LIST_KEY, context.previous);
      toast().show(messageOf(error), { tone: 'error' });
    },
    onSettled: () => refresh(),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.request<TaskWriteResult>('POST', `/tasks/${id}/complete`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      const now = new Date().toISOString();
      return {
        previous: patchList(client, (tasks) =>
          tasks.map((task) => (task.id === id ? applyPatch(task, { status: 'done' }, now) : task)),
        ),
      };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Task completed.', undo);
    },
    onError: (error, _id, context) => {
      if (context?.previous) client.setQueryData(LIST_KEY, context.previous);
      toast().show(messageOf(error), { tone: 'error' });
    },
    onSettled: () => refresh(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.request<TaskWriteResult>('DELETE', `/tasks/${id}`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: TASKS_KEY });
      return { previous: patchList(client, (tasks) => tasks.filter((task) => task.id !== id)) };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Task deleted.', undo);
    },
    onError: (error, _id, context) => {
      if (context?.previous) client.setQueryData(LIST_KEY, context.previous);
      toast().show(messageOf(error), { tone: 'error' });
    },
    onSettled: () => refresh(),
  });

  return { create, update, complete, remove };
}
