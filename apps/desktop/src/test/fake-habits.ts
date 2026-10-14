import {
  buildHabitStats,
  computeStreaks,
  createHabitInput,
  habitDateSchema,
  indiaDateOf,
  isScheduledOn,
  updateHabitInput,
  HABIT_RANGES,
  type Habit,
  type HabitRange,
  type UndoDescriptor,
} from '@personal-os/shared';
import { ApiError, type RequestOptions } from '../api/api-client';
import { NOT_HANDLED } from './fake-modules';

let counter = 900_000;
const idFor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** The stored part of a habit; today, streaks and at-risk are worked out on every read. */
export type StoredHabit = Omit<Habit, 'today' | 'currentStreak' | 'bestStreak' | 'atRisk'>;

/** A habit with sensible defaults (daily, target 1, started long ago); ids look like uuids. */
export function makeHabit(overrides: Partial<StoredHabit> = {}): StoredHabit {
  counter += 1;
  return {
    id: idFor(counter),
    name: `Habit ${String(counter)}`,
    category: null,
    schedule: { type: 'daily' },
    target: 1,
    reminderTime: null,
    color: null,
    notes: '',
    startDate: '2025-01-01',
    archivedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export interface HabitSeed {
  habit: StoredHabit;
  /** Count per India day. */
  logs?: Record<string, number>;
}

let pending: HabitSeed[] = [];

/** Habits the next createHabitsFake() (so the next createFakeApi()) starts with. Call before it. */
export function seedHabits(...seeds: HabitSeed[]) {
  pending = seeds;
}

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * In-memory Habits that follow the real routes (docs/features/habits.md): active / archived lists,
 * one log per habit per India day with a count, the day done at count >= target, streaks and
 * statistics from the shared pure functions, and Undo descriptors that /undo understands.
 */
export function createHabitsFake() {
  const store = new Map<string, StoredHabit>();
  const logs = new Map<string, Map<string, number>>();
  for (const seed of pending) {
    store.set(seed.habit.id, seed.habit);
    logs.set(seed.habit.id, new Map(Object.entries(seed.logs ?? {})));
  }
  pending = [];

  const todayDate = () => indiaDateOf(new Date());
  const missing = () => new ApiError(404, 'not_found', 'Habit not found');
  const find = (id: string) => {
    const habit = store.get(id);
    if (!habit) throw missing();
    return habit;
  };
  const countsOf = (id: string) => {
    let counts = logs.get(id);
    if (!counts) {
      counts = new Map();
      logs.set(id, counts);
    }
    return counts;
  };

  const view = (stored: StoredHabit): Habit => {
    const today = todayDate();
    const counts = countsOf(stored.id);
    const count = counts.get(today) ?? 0;
    const streaks = computeStreaks({ ...stored, counts, today });
    return {
      ...stored,
      today: {
        date: today,
        scheduled: isScheduledOn(stored.schedule, stored.startDate, today),
        count,
        done: count >= stored.target,
      },
      currentStreak: streaks.current,
      bestStreak: streaks.best,
      atRisk: streaks.atRisk,
    };
  };

  const checkDate = (raw: unknown): string => {
    if (raw === undefined || raw === null || raw === '') return todayDate();
    const parsed = habitDateSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, 'validation_error', 'Use a date like 2026-10-14');
    if (parsed.data > todayDate()) {
      throw new ApiError(400, 'validation_error', 'You cannot check in a future day');
    }
    return parsed.data;
  };

  const invalid = (error: { issues: { message: string }[] }) =>
    new ApiError(400, 'validation_error', error.issues[0]?.message ?? 'Check the habit');

  const snapshotFields = (habit: StoredHabit, keys: string[]) => {
    const previous: Record<string, unknown> = {};
    for (const key of keys) previous[key] = habit[key as keyof StoredHabit];
    return previous;
  };

  /** Set the count of a day (0 removes the log) and return how to put it back. */
  const setCount = (id: string, date: string, count: number): UndoDescriptor => {
    const counts = countsOf(id);
    const before = counts.get(date) ?? 0;
    if (count <= 0) counts.delete(date);
    else counts.set(date, count);
    return before === 0
      ? { action: 'habits.unlog', input: { id, date } }
      : { action: 'habits.log', input: { id, date, count: before } };
  };

  const archiveState = (id: string, archived: boolean): UndoDescriptor => {
    const habit = find(id);
    store.set(id, { ...habit, archivedAt: archived ? '2025-10-07T09:30:00.000Z' : null });
    return { action: archived ? 'habits.restore' : 'habits.archive', input: { id } };
  };

  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = (options.body ?? {}) as Record<string, unknown>;
    const query = options.query ?? {};

    if (method === 'GET' && path === '/habits') {
      const archived = query.archived === true || query.archived === 'true';
      const items = [...store.values()]
        .filter((habit) => (habit.archivedAt !== null) === archived)
        .map(view);
      return { items };
    }

    if (method === 'POST' && path === '/habits') {
      const parsed = createHabitInput.safeParse(body);
      if (!parsed.success) throw invalid(parsed.error);
      const input = parsed.data;
      const habit = makeHabit({
        name: input.name,
        category: input.category ?? null,
        schedule: input.schedule,
        target: input.target,
        reminderTime: input.reminderTime ?? null,
        color: input.color ?? null,
        notes: input.notes,
        startDate: input.startDate ?? todayDate(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      store.set(habit.id, habit);
      return { item: view(habit), undo: { action: 'habits.archive', input: { id: habit.id } } };
    }

    if (method === 'POST' && path === '/undo') {
      const { action, input } = body as { action: string; input: Record<string, unknown> };
      if (!action.startsWith('habits.')) return NOT_HANDLED;
      const id = textOf(input.id);
      switch (action) {
        case 'habits.log':
          return handle('PUT', `/habits/${id}/log`, { body: input });
        case 'habits.unlog':
          return handle('DELETE', `/habits/${id}/log`, {
            query: input.date ? { date: textOf(input.date) } : {},
          });
        case 'habits.update':
          return handle('PATCH', `/habits/${id}`, { body: input });
        case 'habits.archive':
          return handle('POST', `/habits/${id}/archive`, {});
        case 'habits.restore':
          return handle('POST', `/habits/${id}/restore`, {});
        default:
          return NOT_HANDLED;
      }
    }

    const match = /^\/habits\/([^/]+)(?:\/(archive|restore|log|stats))?$/.exec(path);
    if (!match) return NOT_HANDLED;
    const id = match[1] ?? '';
    const sub = match[2];

    if (!sub && method === 'GET') return { item: view(find(id)) };

    if (!sub && method === 'PATCH') {
      const habit = find(id);
      const parsed = updateHabitInput.safeParse({ ...body, id });
      if (!parsed.success) throw invalid(parsed.error);
      const { id: _id, ...patch } = parsed.data;
      const undo: UndoDescriptor = {
        action: 'habits.update',
        input: { id, ...snapshotFields(habit, Object.keys(patch)) },
      };
      store.set(id, { ...habit, ...patch, updatedAt: new Date().toISOString() } as StoredHabit);
      return { item: view(find(id)), undo };
    }

    if (sub === 'archive' && method === 'POST') {
      const undo = archiveState(id, true);
      return { item: view(find(id)), undo };
    }
    if (sub === 'restore' && method === 'POST') {
      const undo = archiveState(id, false);
      return { item: view(find(id)), undo };
    }

    if (sub === 'log' && method === 'PUT') {
      const habit = find(id);
      const date = checkDate(body.date);
      const count = typeof body.count === 'number' ? body.count : habit.target;
      if (!Number.isInteger(count) || count < 1) {
        throw new ApiError(400, 'validation_error', 'Count must be a whole number of at least 1');
      }
      const undo = setCount(id, date, count);
      return { item: view(habit), undo };
    }

    if (sub === 'log' && method === 'DELETE') {
      const habit = find(id);
      const date = checkDate(query.date);
      const undo = setCount(id, date, 0);
      return { item: view(habit), undo };
    }

    if (sub === 'stats' && method === 'GET') {
      const habit = find(id);
      const range: HabitRange = HABIT_RANGES.find((value) => value === query.range) ?? 'month';
      const today = todayDate();
      const anchor = query.anchor ? checkAnchor(query.anchor) : today;
      const stats = buildHabitStats({
        ...habit,
        counts: countsOf(id),
        today,
        range,
        anchor,
      });
      return { item: { id, ...stats } };
    }

    return NOT_HANDLED;
  };

  const checkAnchor = (raw: unknown): string => {
    const parsed = habitDateSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, 'validation_error', 'Use a date like 2026-10-14');
    return parsed.data;
  };

  return { handle };
}
