import type {
  CreateGoalInput,
  Goal,
  GoalStatus,
  GoalWriteResult,
  SetGoalStatusInput,
  UndoDescriptor,
  UpdateGoalInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/api-client';
import { useApi } from '../../../api/api-context';
import { useToasts } from '../../../store/toast-store';
import { GOALS_KEY, TASKS_KEY } from '../query-keys';

/** Goals of a status (all when none is given). The key starts with GOALS_KEY. */
export function useGoals(status?: GoalStatus) {
  const api = useApi();
  return useQuery({
    queryKey: [...GOALS_KEY, 'list', status ?? 'all'],
    queryFn: async () =>
      (
        await api.request<{ items: Goal[] }>('GET', '/goals', {
          query: status ? { status } : {},
        })
      ).items,
  });
}

/** One goal with its progress; an unknown or deleted goal answers 404. */
export function useGoal(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...GOALS_KEY, 'detail', id],
    queryFn: async () => (await api.request<{ item: Goal }>('GET', `/goals/${id}`)).item,
  });
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/**
 * Create, edit, close, delete goals and put tasks in or out of a goal. Every change refreshes goals
 * and tasks (a task shows its goal, a goal shows its progress) and offers an Undo toast.
 */
export function useGoalActions() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: GOALS_KEY }),
      client.invalidateQueries({ queryKey: TASKS_KEY }),
    ]);
  };
  const fail = (error: unknown) => {
    toast().show(messageOf(error), { tone: 'error' });
  };
  const offerUndo = (message: string, undo: UndoDescriptor | null) => {
    if (!undo) return;
    toast().show(message, {
      action: {
        label: 'Undo',
        onClick: () => {
          void api.request('POST', '/undo', { body: undo }).then(refresh).catch(fail);
        },
      },
    });
  };

  const create = useMutation({
    mutationFn: (input: CreateGoalInput) =>
      api.request<GoalWriteResult>('POST', '/goals', { body: input }),
    onSuccess: ({ undo }) => {
      offerUndo('Goal created.', undo);
      return refresh();
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateGoalInput) =>
      api.request<GoalWriteResult>('PATCH', `/goals/${id}`, { body: patch }),
    onSuccess: () => refresh(),
    onError: fail,
  });

  /** Achieve, drop, or make active again. */
  const setStatus = useMutation({
    mutationFn: ({ id, ...body }: SetGoalStatusInput) =>
      api.request<GoalWriteResult>('POST', `/goals/${id}/status`, { body }),
    onSuccess: ({ item, undo }) => {
      const message = {
        achieved: 'Goal achieved.',
        dropped: 'Goal dropped.',
        active: 'Goal is active again.',
      }[item.status];
      offerUndo(message, undo);
      return refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.request<GoalWriteResult>('DELETE', `/goals/${id}`),
    onSuccess: ({ undo }) => {
      offerUndo('Goal deleted.', undo);
      // Not awaited: the page leaves at once instead of waiting for a refetch of the deleted goal
      void refresh();
    },
    onError: fail,
  });

  /**
   * Put a task in a goal, move it to another, or take it out (goalId null). `message` is the toast
   * text, for example "Added to Learn Rust."
   */
  const setTaskGoal = useMutation({
    mutationFn: ({ taskId, goalId }: { taskId: string; goalId: string | null; message: string }) =>
      api.request<GoalWriteResult>('PUT', `/tasks/${taskId}/goal`, { body: { goalId } }),
    onSuccess: ({ undo }, { message }) => {
      offerUndo(message, undo);
      return refresh();
    },
    onError: fail,
  });

  return { create, update, setStatus, remove, setTaskGoal };
}
