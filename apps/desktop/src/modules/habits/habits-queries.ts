import type {
  CreateHabitInput,
  Habit,
  HabitRange,
  HabitStats,
  UndoDescriptor,
  UpdateHabitInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { HABITS_KEY } from './query-keys';

interface HabitWrite {
  item: Habit;
  undo: UndoDescriptor | null;
}

type Snapshot = [readonly unknown[], Habit[]][];

/** Active habits (or the archived ones) with today's status and streaks. */
export function useHabits(archived = false) {
  const api = useApi();
  return useQuery({
    queryKey: [...HABITS_KEY, 'list', archived ? 'archived' : 'active'],
    queryFn: async () =>
      (
        await api.request<{ items: Habit[] }>('GET', '/habits', {
          query: { archived },
        })
      ).items,
  });
}

/** Per-day history and numbers of one habit for a week, month or year around `anchor`. */
export function useHabitStats(id: string, range: HabitRange, anchor: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...HABITS_KEY, 'stats', id, range, anchor],
    queryFn: async () =>
      (
        await api.request<{ item: HabitStats }>('GET', `/habits/${id}/stats`, {
          query: { range, anchor },
        })
      ).item,
  });
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/**
 * Check in, change and archive habits. A check-in of today updates the list at once (and rolls back
 * with the server's message when refused); every change refreshes all Habits queries and offers Undo.
 */
export function useHabitActions() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = () => client.invalidateQueries({ queryKey: HABITS_KEY });
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

  /** Only the cached lists that contain this habit, so a rollback leaves other entries alone. */
  const snapshotOf = (id: string): Snapshot =>
    client
      .getQueriesData<Habit[]>({ queryKey: [...HABITS_KEY, 'list'] })
      .filter((entry): entry is [readonly unknown[], Habit[]] =>
        Boolean(entry[1]?.some((habit) => habit.id === id)),
      );

  /** Put a new count into the cached "today" of one habit, before the server answers. */
  const patchToday = async (id: string, count: (habit: Habit) => number) => {
    await client.cancelQueries({ queryKey: HABITS_KEY });
    const snapshot = snapshotOf(id);
    client.setQueriesData<Habit[]>({ queryKey: [...HABITS_KEY, 'list'] }, (list) =>
      list?.map((habit) => {
        if (habit.id !== id) return habit;
        const next = count(habit);
        return { ...habit, today: { ...habit.today, count: next, done: next >= habit.target } };
      }),
    );
    return { snapshot };
  };
  const rollback = (context?: { snapshot: Snapshot }) => {
    for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data);
  };

  const create = useMutation({
    mutationFn: (input: CreateHabitInput) =>
      api.request<HabitWrite>('POST', '/habits', { body: input }),
    onSuccess: ({ undo }) => {
      offerUndo('Habit created.', undo);
      return refresh();
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateHabitInput) =>
      api.request<HabitWrite>('PATCH', `/habits/${id}`, { body: patch }),
    onSuccess: ({ undo }) => {
      offerUndo('Habit saved.', undo);
      return refresh();
    },
    onError: fail,
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.request<HabitWrite>('POST', `/habits/${id}/archive`),
    onSuccess: ({ undo }) => {
      offerUndo('Habit archived.', undo);
      return refresh();
    },
    onError: fail,
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.request<HabitWrite>('POST', `/habits/${id}/restore`),
    onSuccess: ({ undo }) => {
      offerUndo('Habit restored.', undo);
      return refresh();
    },
    onError: fail,
  });

  /**
   * Set the count of a day. Without `count` the day is marked done with the habit's target. `quiet`
   * skips the Undo toast (a counter's + button). Without `date` it is today.
   */
  const log = useMutation({
    mutationFn: ({
      id,
      date,
      count,
    }: {
      id: string;
      date?: string;
      count?: number;
      quiet?: boolean;
    }) =>
      api.request<HabitWrite>('PUT', `/habits/${id}/log`, {
        body: { ...(date ? { date } : {}), ...(count === undefined ? {} : { count }) },
      }),
    onMutate: ({ id, date, count }) =>
      date ? undefined : patchToday(id, (habit) => count ?? habit.target),
    onSuccess: ({ undo }, { quiet }) => {
      if (!quiet) offerUndo('Marked done.', undo);
      return refresh();
    },
    onError: (error, _input, context) => {
      rollback(context);
      fail(error);
    },
  });

  /** Remove the check-in of a day (default today). */
  const unlog = useMutation({
    mutationFn: ({ id, date }: { id: string; date?: string; quiet?: boolean }) =>
      api.request<HabitWrite>('DELETE', `/habits/${id}/log`, {
        query: date ? { date } : {},
      }),
    onMutate: ({ id, date }) => (date ? undefined : patchToday(id, () => 0)),
    onSuccess: ({ undo }, { quiet }) => {
      if (!quiet) offerUndo('Check-in removed.', undo);
      return refresh();
    },
    onError: (error, _input, context) => {
      rollback(context);
      fail(error);
    },
  });

  return { create, update, archive, restore, log, unlog };
}

export type { HabitRange };
