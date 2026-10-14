import { projects, tasks, timeEntries, type TimeEntryRow } from '@personal-os/db';
import {
  MAX_TIME_ENTRY_SECONDS,
  timeActions,
  type TimeEntry,
  type TimeSummary,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, desc, eq, gte, inArray, isNull, lte, notInArray } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import {
  DAY_MS,
  IST_MS,
  deletedProjectIds,
  entrySeconds,
  findProject,
  iso,
  taskNotFound,
} from './project-shared';
import { implement } from './registry';

/**
 * Time tracking of the Projects lane. At most one running entry (endedAt null) per user: starting a
 * timer stops the running one first, inside withUserLock and one transaction. Times are UTC; weeks
 * in the summary start on Monday 00:00 India time. Entries of a deleted project are hidden from the
 * list and the summary (they come back when the project is restored); the running timer is always
 * shown so it can be stopped.
 *
 * Undo limits: time.start's undo deletes the new entry (a timer it stopped stays stopped). time.stop
 * has no undo (endedAt cannot be cleared by time.update).
 */

const entryNotFound = () => new HttpError(404, 'not_found', 'Time entry not found');
const invalid = (message: string) => new HttpError(400, 'validation_error', message);

async function presentEntries(
  scope: UserScope,
  rows: TimeEntryRow[],
  now: Date = new Date(),
): Promise<TimeEntry[]> {
  if (rows.length === 0) return [];
  const projectIds = [...new Set(rows.map((row) => row.projectId))];
  const taskIds = [...new Set(rows.flatMap((row) => (row.taskId ? [row.taskId] : [])))];
  const projectRows = await scope.select(projects, { where: inArray(projects.id, projectIds) });
  const taskRows =
    taskIds.length === 0
      ? []
      : await scope.select(tasks, { where: inArray(tasks.id, taskIds) });
  const projectTitle = new Map(projectRows.map((project) => [project.id, project.title]));
  const taskTitle = new Map(taskRows.map((task) => [task.id, task.title]));
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectTitle: projectTitle.get(row.projectId) ?? '',
    taskId: row.taskId,
    taskTitle: row.taskId ? (taskTitle.get(row.taskId) ?? null) : null,
    startedAt: row.startedAt.toISOString(),
    endedAt: iso(row.endedAt),
    seconds: entrySeconds(row, now),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function presentEntry(scope: UserScope, row: TimeEntryRow): Promise<TimeEntry> {
  return (await presentEntries(scope, [row]))[0] as TimeEntry;
}

async function findEntry(
  scope: UserScope,
  id: string,
  includeDeleted = false,
): Promise<TimeEntryRow> {
  const [row] = await scope.select(timeEntries, {
    where: includeDeleted
      ? eq(timeEntries.id, id)
      : and(eq(timeEntries.id, id), scope.isLive(timeEntries)),
    limit: 1,
  });
  if (!row) throw entryNotFound();
  return row;
}

async function assertTask(scope: UserScope, taskId: string | null | undefined) {
  if (!taskId) return;
  const [task] = await scope.select(tasks, {
    where: and(eq(tasks.id, taskId), scope.isLive(tasks)),
    limit: 1,
  });
  if (!task) throw taskNotFound();
}

const runningRows = (scope: UserScope) =>
  scope.select(timeEntries, {
    where: and(scope.isLive(timeEntries), isNull(timeEntries.endedAt)),
  });

/** The Monday 00:00 India time (as a UTC millisecond value) of the week that contains `ms`. */
function weekStartMs(ms: number): number {
  const day = Math.floor((ms + IST_MS) / DAY_MS);
  // 1970-01-01 was a Thursday: with Monday = 0, day 0 is weekday 3
  const sinceMonday = (day + 3) % 7;
  return (day - sinceMonday) * DAY_MS - IST_MS;
}

const WEEK_MS = 7 * DAY_MS;

export const timeImplementations = [
  implement(timeActions.list, async ({ scope }, input) => {
    const hidden = await deletedProjectIds(scope);
    const rows = await scope.select(timeEntries, {
      where: and(
        scope.isLive(timeEntries),
        input.projectId ? eq(timeEntries.projectId, input.projectId) : undefined,
        input.taskId ? eq(timeEntries.taskId, input.taskId) : undefined,
        input.from ? gte(timeEntries.startedAt, new Date(input.from)) : undefined,
        input.to ? lte(timeEntries.startedAt, new Date(input.to)) : undefined,
        hidden.length > 0 ? notInArray(timeEntries.projectId, hidden) : undefined,
      ),
      orderBy: [desc(timeEntries.startedAt), desc(timeEntries.id)],
      limit: input.limit,
    });
    return { data: await presentEntries(scope, rows) };
  }),

  implement(timeActions.running, async ({ scope }) => {
    const [row] = await runningRows(scope);
    return { data: row ? await presentEntry(scope, row) : null };
  }),

  implement(timeActions.summary, async ({ scope }, { projectId, weeks }) => {
    const now = new Date();
    const lastWeek = weekStartMs(now.getTime());
    const firstWeek = lastWeek - (weeks - 1) * WEEK_MS;
    const hidden = await deletedProjectIds(scope);
    const rows = await scope.select(timeEntries, {
      where: and(
        scope.isLive(timeEntries),
        projectId ? eq(timeEntries.projectId, projectId) : undefined,
        gte(timeEntries.startedAt, new Date(firstWeek)),
        hidden.length > 0 ? notInArray(timeEntries.projectId, hidden) : undefined,
      ),
    });
    const perWeek = Array.from({ length: weeks }, () => 0);
    const perProject = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      const index = Math.floor((row.startedAt.getTime() - firstWeek) / WEEK_MS);
      if (index < 0 || index >= weeks) continue;
      const seconds = entrySeconds(row, now);
      perWeek[index] = (perWeek[index] ?? 0) + seconds;
      perProject.set(row.projectId, (perProject.get(row.projectId) ?? 0) + seconds);
      total += seconds;
    }
    const ids = [...perProject.keys()];
    const projectRows =
      ids.length === 0 ? [] : await scope.select(projects, { where: inArray(projects.id, ids) });
    const titles = new Map(projectRows.map((project) => [project.id, project.title]));
    const data: TimeSummary = {
      totalSeconds: total,
      byProject: ids
        .map((id) => ({ projectId: id, title: titles.get(id) ?? '', seconds: perProject.get(id) ?? 0 }))
        .sort((a, b) => b.seconds - a.seconds || a.title.localeCompare(b.title)),
      byWeek: perWeek.map((seconds, index) => ({
        weekStart: new Date(firstWeek + index * WEEK_MS).toISOString(),
        seconds,
      })),
    };
    return { data };
  }),

  implement(timeActions.start, ({ scope }, input) =>
    withUserLock('time', scope.userId, () =>
      scope.transaction(async (tx) => {
        await findProject(tx, input.projectId);
        await assertTask(tx, input.taskId);
        const now = new Date();
        for (const running of await runningRows(tx)) {
          await tx.update(
            timeEntries,
            { endedAt: now.getTime() >= running.startedAt.getTime() ? now : running.startedAt },
            eq(timeEntries.id, running.id),
          );
        }
        const [created] = await tx.insert(timeEntries, {
          projectId: input.projectId,
          taskId: input.taskId ?? null,
          startedAt: now,
          note: input.note ?? null,
        });
        if (!created) throw new Error('Could not start the timer');
        return {
          data: await presentEntry(tx, created),
          undo: { action: 'time.delete', input: { id: created.id } },
        };
      }),
    ),
  ),

  // No undo: endedAt cannot be cleared by time.update
  implement(timeActions.stop, ({ scope }, { id }) =>
    withUserLock('time', scope.userId, () =>
      scope.transaction(async (tx) => {
        const [running] = await tx.select(timeEntries, {
          where: and(
            tx.isLive(timeEntries),
            isNull(timeEntries.endedAt),
            id ? eq(timeEntries.id, id) : undefined,
          ),
          limit: 1,
        });
        if (!running) throw new HttpError(404, 'not_found', 'No timer is running');
        const now = new Date();
        const [stopped] = await tx.update(
          timeEntries,
          { endedAt: now.getTime() >= running.startedAt.getTime() ? now : running.startedAt },
          eq(timeEntries.id, running.id),
        );
        if (!stopped) throw entryNotFound();
        return { data: await presentEntry(tx, stopped), undo: null };
      }),
    ),
  ),

  implement(timeActions.add, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      await findProject(tx, input.projectId);
      await assertTask(tx, input.taskId);
      const [created] = await tx.insert(timeEntries, {
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        startedAt: new Date(input.startedAt),
        endedAt: new Date(input.endedAt),
        note: input.note ?? null,
      });
      if (!created) throw new Error('Could not add the time entry');
      return {
        data: await presentEntry(tx, created),
        undo: { action: 'time.delete', input: { id: created.id } },
      };
    }),
  ),

  implement(timeActions.update, async ({ scope }, { id, ...patch }) =>
    scope.transaction(async (tx) => {
      const current = await findEntry(tx, id);
      if (current.endedAt === null && patch.endedAt !== undefined) {
        throw invalid('Stop the timer to set its end');
      }
      const startedAt = patch.startedAt ? new Date(patch.startedAt) : current.startedAt;
      const endedAt = patch.endedAt ? new Date(patch.endedAt) : current.endedAt;
      if (endedAt) {
        if (endedAt.getTime() <= startedAt.getTime()) {
          throw invalid('The end must be after the start');
        }
        if (endedAt.getTime() - startedAt.getTime() > MAX_TIME_ENTRY_SECONDS * 1000) {
          throw invalid('An entry can be at most 24 hours');
        }
      } else if (startedAt.getTime() > Date.now()) {
        throw invalid('A running timer cannot start in the future');
      }
      if (patch.taskId !== undefined && patch.taskId !== current.taskId) {
        await assertTask(tx, patch.taskId);
      }

      const values: Partial<typeof timeEntries.$inferInsert> = {};
      const previous: Record<string, unknown> = {};
      if (patch.taskId !== undefined && patch.taskId !== current.taskId) {
        values.taskId = patch.taskId;
        previous.taskId = current.taskId;
      }
      if (startedAt.getTime() !== current.startedAt.getTime()) {
        values.startedAt = startedAt;
        previous.startedAt = current.startedAt.toISOString();
      }
      if (current.endedAt && endedAt && endedAt.getTime() !== current.endedAt.getTime()) {
        values.endedAt = endedAt;
        previous.endedAt = current.endedAt.toISOString();
      }
      if (patch.note !== undefined && patch.note !== current.note) {
        values.note = patch.note;
        previous.note = current.note;
      }
      if (Object.keys(values).length === 0) {
        return { data: await presentEntry(tx, current), undo: null };
      }
      const [updated] = await tx.update(timeEntries, values, eq(timeEntries.id, id));
      if (!updated) throw entryNotFound();
      return {
        data: await presentEntry(tx, updated),
        undo: { action: 'time.update', input: { id, ...previous } } satisfies UndoDescriptor,
      };
    }),
  ),

  implement(timeActions.delete, async ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      await findEntry(tx, id);
      const [deleted] = await tx.softDelete(timeEntries, eq(timeEntries.id, id));
      if (!deleted) throw entryNotFound();
      return {
        data: await presentEntry(tx, deleted),
        undo: { action: 'time.restore', input: { id } },
      };
    }),
  ),

  implement(timeActions.restore, ({ scope }, { id }) =>
    withUserLock('time', scope.userId, () =>
      scope.transaction(async (tx) => {
        const current = await findEntry(tx, id, true);
        if (!current.deletedAt) return { data: await presentEntry(tx, current), undo: null };
        if (current.endedAt === null && (await runningRows(tx)).length > 0) {
          throw new HttpError(409, 'timer_running', 'Another timer is running. Stop it first.');
        }
        const [restored] = await tx.update(timeEntries, { deletedAt: null }, eq(timeEntries.id, id));
        if (!restored) throw entryNotFound();
        return {
          data: await presentEntry(tx, restored),
          undo: { action: 'time.delete', input: { id } },
        };
      }),
    ),
  ),
];
