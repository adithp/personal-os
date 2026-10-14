import { habitLogs, habits, type HabitLogRow, type HabitRow } from '@personal-os/db';
import {
  buildHabitStats,
  computeStreaks,
  habitActions,
  indiaDateOf,
  isScheduledOn,
  type Habit,
  type HabitStats,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * Habits (docs/design/research/habits.md). A habit has a schedule and a target per scheduled day; a
 * log is one row per habit per India day with a count (done when count >= target). Streaks and
 * statistics come from the pure functions in packages/shared/src/habits.ts. Archive keeps the
 * history. Logging is only allowed on a live habit, from its start date up to today (India days).
 * "Today" comes from the clock (new Date()), so tests can set the system time.
 */

const iso = (date: Date) => date.toISOString();
const notFound = () => new HttpError(404, 'not_found', 'Habit not found');
const invalid = (message: string) => new HttpError(400, 'validation_error', message);

type CountMap = Map<string, number>;

async function logsOf(
  scope: UserScope,
  habitIds: readonly string[],
): Promise<Map<string, CountMap>> {
  const byHabit = new Map<string, CountMap>();
  if (habitIds.length === 0) return byHabit;
  const rows: HabitLogRow[] = await scope.select(habitLogs, {
    where: inArray(habitLogs.habitId, [...habitIds]),
  });
  for (const row of rows) {
    const counts = byHabit.get(row.habitId) ?? new Map<string, number>();
    counts.set(row.logDate, row.count);
    byHabit.set(row.habitId, counts);
  }
  return byHabit;
}

export function toHabit(row: HabitRow, counts: CountMap, today: string): Habit {
  const streaks = computeStreaks({
    schedule: row.schedule,
    startDate: row.startDate,
    target: row.target,
    counts,
    today,
  });
  const count = counts.get(today) ?? 0;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    schedule: row.schedule,
    target: row.target,
    reminderTime: row.reminderTime,
    color: row.color,
    notes: row.notes,
    startDate: row.startDate,
    archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    today: {
      date: today,
      scheduled: isScheduledOn(row.schedule, row.startDate, today),
      count,
      done: count >= row.target,
    },
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    atRisk: streaks.atRisk,
  };
}

async function findHabit(scope: UserScope, id: string): Promise<HabitRow> {
  const [row] = await scope.select(habits, { where: eq(habits.id, id), limit: 1 });
  if (!row) throw notFound();
  return row;
}

/** The habit as the client sees it, read fresh (with its logs). */
async function habitView(scope: UserScope, id: string): Promise<Habit> {
  const row = await findHabit(scope, id);
  const counts = (await logsOf(scope, [id])).get(id) ?? new Map<string, number>();
  return toHabit(row, counts, indiaDateOf(new Date()));
}

/** Checks the day of a log: not in the future, not before the habit started. */
function assertLoggable(row: HabitRow, date: string, today: string): void {
  if (row.archivedAt) throw new HttpError(409, 'habit_archived', 'Restore this habit first');
  if (date > today) throw invalid('You cannot log a day that has not come yet');
  if (date < row.startDate) throw invalid('That day is before the habit started');
}

const undoLog = (id: string, date: string, previous: number | undefined): UndoDescriptor =>
  previous === undefined
    ? { action: 'habits.unlog', input: { id, date } }
    : { action: 'habits.log', input: { id, date, count: previous } };

export const habitImplementations = [
  implement(habitActions.list, async ({ scope }, input) => {
    const rows = await scope.select(habits, {
      where: input.archived ? isNotNull(habits.archivedAt) : isNull(habits.archivedAt),
      orderBy: input.archived
        ? [desc(habits.archivedAt), asc(habits.id)]
        : [asc(habits.createdAt), asc(habits.id)],
    });
    const logs = await logsOf(
      scope,
      rows.map((row) => row.id),
    );
    const today = indiaDateOf(new Date());
    return {
      data: rows.map((row) => toHabit(row, logs.get(row.id) ?? new Map<string, number>(), today)),
    };
  }),

  implement(habitActions.get, async ({ scope }, { id }) => ({ data: await habitView(scope, id) })),

  implement(habitActions.create, async ({ scope }, input) => {
    const today = indiaDateOf(new Date());
    const [row] = await scope.insert(habits, {
      name: input.name,
      category: input.category ?? null,
      schedule: input.schedule,
      target: input.target,
      reminderTime: input.reminderTime ?? null,
      color: input.color ?? null,
      notes: input.notes,
      startDate: input.startDate ?? today,
    });
    if (!row) throw new Error('Could not create the habit');
    return {
      data: toHabit(row, new Map(), today),
      // There is no delete action: undoing a create archives the habit (its history is kept)
      undo: { action: 'habits.archive', input: { id: row.id } } satisfies UndoDescriptor,
    };
  }),

  implement(habitActions.update, async ({ scope }, input) => {
    const before = await findHabit(scope, input.id);
    const values: Partial<typeof habits.$inferInsert> = {};
    const undoInput: Record<string, unknown> = {};
    const change = <K extends keyof HabitRow & keyof typeof habits.$inferInsert>(
      key: K,
      next: HabitRow[K] | undefined,
    ) => {
      if (next === undefined || JSON.stringify(next) === JSON.stringify(before[key])) return;
      (values as Record<string, unknown>)[key] = next;
      undoInput[key] = before[key];
    };
    change('name', input.name);
    change('category', input.category);
    change('schedule', input.schedule);
    change('target', input.target);
    change('reminderTime', input.reminderTime);
    change('color', input.color);
    change('notes', input.notes);
    change('startDate', input.startDate);
    if (Object.keys(values).length === 0) {
      return { data: await habitView(scope, input.id), undo: null };
    }
    await scope.update(habits, values, eq(habits.id, input.id));
    return {
      data: await habitView(scope, input.id),
      undo: {
        action: 'habits.update',
        input: { id: input.id, ...undoInput },
      } satisfies UndoDescriptor,
    };
  }),

  implement(habitActions.archive, async ({ scope }, { id }) => {
    const before = await findHabit(scope, id);
    if (before.archivedAt) return { data: await habitView(scope, id), undo: null };
    await scope.update(habits, { archivedAt: new Date() }, eq(habits.id, id));
    return {
      data: await habitView(scope, id),
      undo: { action: 'habits.restore', input: { id } } satisfies UndoDescriptor,
    };
  }),

  implement(habitActions.restore, async ({ scope }, { id }) => {
    const before = await findHabit(scope, id);
    if (!before.archivedAt) return { data: await habitView(scope, id), undo: null };
    await scope.update(habits, { archivedAt: null }, eq(habits.id, id));
    return {
      data: await habitView(scope, id),
      undo: { action: 'habits.archive', input: { id } } satisfies UndoDescriptor,
    };
  }),

  implement(habitActions.log, ({ scope }, input) =>
    // One queue per user: two quick clicks never both insert the day's row
    withUserLock('habits', scope.userId, async () => {
      const row = await findHabit(scope, input.id);
      const today = indiaDateOf(new Date());
      const date = input.date ?? today;
      assertLoggable(row, date, today);
      const count = input.count ?? row.target;
      const [existing] = await scope.select(habitLogs, {
        where: and(eq(habitLogs.habitId, input.id), eq(habitLogs.logDate, date)),
        limit: 1,
      });
      if (existing) {
        if (existing.count !== count) {
          await scope.update(habitLogs, { count }, eq(habitLogs.id, existing.id));
        }
      } else {
        await scope.insert(habitLogs, { habitId: input.id, logDate: date, count });
      }
      const unchanged = existing?.count === count;
      return {
        data: await habitView(scope, input.id),
        undo: unchanged ? null : undoLog(input.id, date, existing?.count),
      };
    }),
  ),

  implement(habitActions.unlog, ({ scope }, input) =>
    withUserLock('habits', scope.userId, async () => {
      const row = await findHabit(scope, input.id);
      const today = indiaDateOf(new Date());
      const date = input.date ?? today;
      assertLoggable(row, date, today);
      const removed = await scope.delete(
        habitLogs,
        and(eq(habitLogs.habitId, input.id), eq(habitLogs.logDate, date)) as SQL,
      );
      const [previous] = removed;
      return {
        data: await habitView(scope, input.id),
        undo: previous ? undoLog(input.id, date, previous.count) : null,
      };
    }),
  ),

  implement(habitActions.stats, async ({ scope }, input): Promise<{ data: HabitStats }> => {
    const row = await findHabit(scope, input.id);
    const counts = (await logsOf(scope, [input.id])).get(input.id) ?? new Map<string, number>();
    const today = indiaDateOf(new Date());
    const stats = buildHabitStats({
      schedule: row.schedule,
      startDate: row.startDate,
      target: row.target,
      counts,
      today,
      range: input.range,
      anchor: input.anchor ?? today,
    });
    return { data: { id: row.id, ...stats } };
  }),
];
