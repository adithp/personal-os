import { entities, goals, links, tasks, type GoalRow } from '@personal-os/db';
import {
  MAX_TASKS_PER_GOAL,
  goalActions,
  type Goal,
  type GoalProgress,
  type TaskGoal,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * Goals of the Tasks module (docs/design/research/tasks-goals.md, decisions D1 to D4, D10).
 * A goal is an entity of type `goal` with a row in `goals`; a task joins it through a live
 * `belongs_to` link (source = task, target = goal). One goal per task; only top-level tasks; the
 * target of the link must be a goal (projects will share `belongs_to` in Step 5); at most 500
 * counted tasks per goal (409). Progress = done and total over linked, live, top-level tasks that are
 * not archived or are done (D4), computed in code from rows read through scope.select.
 * goals.delete soft-deletes the goal and its entity row and keeps the links so the undo restores all.
 */

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The start of the India calendar day that contains this time (a target date is stored so). */
const istDayStart = (isoTime: string) =>
  new Date(Math.floor((Date.parse(isoTime) + IST_MS) / DAY_MS) * DAY_MS - IST_MS);

const iso = (date: Date | null) => (date ? date.toISOString() : null);

const goalNotFound = () => new HttpError(404, 'not_found', 'Goal not found');
const taskNotFound = () => new HttpError(404, 'not_found', 'Task not found');

/** The live `belongs_to` links from these tasks (to goals or, later, to projects). */
const taskLinks = (scope: UserScope, taskIds: readonly string[]) =>
  scope.select(links, {
    where: and(
      scope.isLive(links),
      eq(links.relation, 'belongs_to'),
      inArray(links.sourceId, [...taskIds]),
    ),
  });

/**
 * For each goal id, its progress. Goals without tasks have { done: 0, total: 0 }. Two queries for
 * any number of ids.
 */
export async function loadGoalProgress(
  scope: UserScope,
  goalIds: readonly string[],
): Promise<Map<string, GoalProgress>> {
  const result = new Map<string, GoalProgress>(goalIds.map((id) => [id, { done: 0, total: 0 }]));
  if (goalIds.length === 0) return result;
  const rows = await scope.select(links, {
    where: and(
      scope.isLive(links),
      eq(links.relation, 'belongs_to'),
      inArray(links.targetId, [...goalIds]),
    ),
  });
  if (rows.length === 0) return result;
  // Top-level, live tasks that are open and not archived, or done (an archived done task counts)
  const counted = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      isNull(tasks.parentTaskId),
      or(isNull(tasks.archivedAt), eq(tasks.status, 'done')),
      inArray(tasks.id, [...new Set(rows.map((row) => row.sourceId))]),
    ),
  });
  const byId = new Map(counted.map((task) => [task.id, task]));
  for (const row of rows) {
    const task = byId.get(row.sourceId);
    const progress = result.get(row.targetId);
    if (!task || !progress) continue;
    progress.total += 1;
    if (task.status === 'done') progress.done += 1;
  }
  return result;
}

/** For each task id, the live goal it belongs to (tasks without a goal are absent). */
export async function loadTaskGoals(
  scope: UserScope,
  taskIds: readonly string[],
): Promise<Map<string, TaskGoal>> {
  const result = new Map<string, TaskGoal>();
  if (taskIds.length === 0) return result;
  const rows = await taskLinks(scope, taskIds);
  if (rows.length === 0) return result;
  const found = await scope.select(goals, {
    where: and(scope.isLive(goals), inArray(goals.id, [...new Set(rows.map((r) => r.targetId))])),
  });
  const byId = new Map(found.map((goal) => [goal.id, goal]));
  for (const row of rows) {
    const goal = byId.get(row.targetId);
    if (goal) result.set(row.sourceId, { id: goal.id, title: goal.title });
  }
  return result;
}

/** The ids of the live top-level tasks linked to a live goal (any status, archived too). */
export async function taskIdsOfGoal(scope: UserScope, goalId: string): Promise<string[]> {
  const [goal] = await scope.select(goals, {
    where: and(eq(goals.id, goalId), scope.isLive(goals)),
    limit: 1,
  });
  if (!goal) return [];
  const rows = await scope.select(links, {
    where: and(scope.isLive(links), eq(links.relation, 'belongs_to'), eq(links.targetId, goalId)),
  });
  if (rows.length === 0) return [];
  const found = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      isNull(tasks.parentTaskId),
      inArray(tasks.id, [...new Set(rows.map((row) => row.sourceId))]),
    ),
  });
  return found.map((task) => task.id);
}

/** A goal of this user that is live (or, with includeDeleted, deleted too). */
async function findGoal(scope: UserScope, id: string, includeDeleted = false): Promise<GoalRow> {
  const [row] = await scope.select(goals, {
    where: includeDeleted ? eq(goals.id, id) : and(eq(goals.id, id), scope.isLive(goals)),
    limit: 1,
  });
  if (!row) throw goalNotFound();
  return row;
}

function toGoal(row: GoalRow, progress: GoalProgress | undefined): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    targetAt: iso(row.targetAt),
    status: row.status,
    closedAt: iso(row.closedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    progress: progress ?? { done: 0, total: 0 },
  };
}

async function present(scope: UserScope, row: GoalRow): Promise<Goal> {
  return toGoal(row, (await loadGoalProgress(scope, [row.id])).get(row.id));
}

/**
 * Puts a task in a goal inside the caller's transaction. Returns the live goal the task was in
 * before (null when none) and whether anything changed. Checks everything before changing anything.
 */
async function putTaskInGoal(
  scope: UserScope,
  taskId: string,
  goalId: string,
): Promise<{ changed: boolean; previousGoalId: string | null }> {
  // The target must be a live entity of type goal, with its goals row
  const [entity] = await scope.select(entities, {
    where: and(eq(entities.id, goalId), eq(entities.type, 'goal'), scope.isLive(entities)),
    limit: 1,
  });
  if (!entity) throw goalNotFound();
  await findGoal(scope, goalId);

  const [task] = await scope.select(tasks, {
    where: and(eq(tasks.id, taskId), scope.isLive(tasks)),
    limit: 1,
  });
  if (!task) throw taskNotFound();
  if (task.parentTaskId) {
    throw new HttpError(400, 'validation_error', 'Link the parent task instead.');
  }

  // Links to goals only (a `belongs_to` link may also point at a project later), deleted goals too
  const existing = await taskLinks(scope, [taskId]);
  const goalRows =
    existing.length === 0
      ? []
      : await scope.select(goals, {
          where: inArray(goals.id, [...new Set(existing.map((link) => link.targetId))]),
        });
  const goalById = new Map(goalRows.map((goal) => [goal.id, goal]));
  const goalLinks = existing.filter((link) => goalById.has(link.targetId));
  if (goalLinks.some((link) => link.targetId === goalId)) {
    return { changed: false, previousGoalId: goalId };
  }

  const total = (await loadGoalProgress(scope, [goalId])).get(goalId)?.total ?? 0;
  if (total >= MAX_TASKS_PER_GOAL) {
    throw new HttpError(
      409,
      'goal_full',
      `A goal can have at most ${String(MAX_TASKS_PER_GOAL)} tasks.`,
    );
  }

  if (goalLinks.length > 0) {
    await scope.softDelete(
      links,
      inArray(
        links.id,
        goalLinks.map((link) => link.id),
      ),
    );
  }
  await scope.insert(links, { sourceId: taskId, targetId: goalId, relation: 'belongs_to' });
  const previous = goalLinks.find((link) => goalById.get(link.targetId)?.deletedAt === null);
  return { changed: true, previousGoalId: previous?.targetId ?? null };
}

/** Puts a task in a goal inside the caller's transaction (used by tasks.create with goalId). */
export async function linkTaskToGoal(
  scope: UserScope,
  taskId: string,
  goalId: string,
): Promise<void> {
  await putTaskInGoal(scope, taskId, goalId);
}

const ORDER = { active: 0, achieved: 1, dropped: 2 } as const;

/** Active first by target date (soonest first, none last) then created; closed ones newest first. */
function compareGoals(a: Goal, b: Goal): number {
  if (a.status !== b.status) return ORDER[a.status] - ORDER[b.status];
  if (a.status === 'active') {
    if (a.targetAt !== b.targetAt) {
      if (a.targetAt === null) return 1;
      if (b.targetAt === null) return -1;
      return a.targetAt < b.targetAt ? -1 : 1;
    }
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  }
  return (b.closedAt ?? '').localeCompare(a.closedAt ?? '') || a.id.localeCompare(b.id);
}

export const goalImplementations = [
  implement(goalActions.list, async ({ scope }, input) => {
    const rows = await scope.select(goals, {
      where: and(scope.isLive(goals), input.status ? eq(goals.status, input.status) : undefined),
    });
    const progress = await loadGoalProgress(
      scope,
      rows.map((row) => row.id),
    );
    return { data: rows.map((row) => toGoal(row, progress.get(row.id))).sort(compareGoals) };
  }),

  implement(goalActions.get, async ({ scope }, { id }) => ({
    data: await present(scope, await findGoal(scope, id)),
  })),

  implement(goalActions.create, async ({ scope }, input) => {
    const row = await scope.transaction(async (tx) => {
      const [entity] = await tx.insert(entities, { type: 'goal', title: input.title });
      if (!entity) throw new Error('Could not create the goal');
      const [created] = await tx.insert(goals, {
        id: entity.id,
        title: input.title,
        description: input.description ?? null,
        targetAt: input.targetAt ? istDayStart(input.targetAt) : null,
      });
      if (!created) throw new Error('Could not create the goal');
      return created;
    });
    return {
      data: await present(scope, row),
      undo: { action: 'goals.delete', input: { id: row.id } },
    };
  }),

  implement(goalActions.update, async ({ scope }, { id, ...patch }) =>
    scope.transaction(async (tx) => {
      const current = await findGoal(tx, id);
      const values: Partial<typeof goals.$inferInsert> = {};
      const previous: Record<string, unknown> = {};
      if (patch.title !== undefined && patch.title !== current.title) {
        values.title = patch.title;
        previous.title = current.title;
      }
      if (patch.description !== undefined && patch.description !== current.description) {
        values.description = patch.description;
        previous.description = current.description;
      }
      if (patch.targetAt !== undefined) {
        const next = patch.targetAt === null ? null : istDayStart(patch.targetAt);
        if (iso(next) !== iso(current.targetAt)) {
          values.targetAt = next;
          previous.targetAt = iso(current.targetAt);
        }
      }
      if (Object.keys(values).length === 0) return { data: await present(tx, current), undo: null };
      const [updated] = await tx.update(goals, values, eq(goals.id, id));
      if (!updated) throw goalNotFound();
      if (values.title !== undefined) {
        await tx.update(entities, { title: values.title }, eq(entities.id, id));
      }
      return {
        data: await present(tx, updated),
        undo: { action: 'goals.update', input: { id, ...previous } } satisfies UndoDescriptor,
      };
    }),
  ),

  implement(goalActions.setStatus, async ({ scope }, { id, status, closedAt }) =>
    scope.transaction(async (tx) => {
      const current = await findGoal(tx, id);
      if (current.status === status) return { data: await present(tx, current), undo: null };
      const [updated] = await tx.update(
        goals,
        {
          status,
          closedAt: status === 'active' ? null : closedAt ? new Date(closedAt) : new Date(),
        },
        eq(goals.id, id),
      );
      if (!updated) throw goalNotFound();
      return {
        data: await present(tx, updated),
        undo: {
          action: 'goals.setStatus',
          input: { id, status: current.status, closedAt: iso(current.closedAt) },
        } satisfies UndoDescriptor,
      };
    }),
  ),

  // The links stay, so the undo brings the goal back with its tasks; the tasks are not touched
  implement(goalActions.delete, async ({ scope }, { id }) => {
    const row = await scope.transaction(async (tx) => {
      await findGoal(tx, id);
      const [deleted] = await tx.softDelete(goals, eq(goals.id, id));
      await tx.softDelete(entities, eq(entities.id, id));
      if (!deleted) throw goalNotFound();
      return deleted;
    });
    return { data: await present(scope, row), undo: { action: 'goals.restore', input: { id } } };
  }),

  implement(goalActions.restore, async ({ scope }, { id }) => {
    const { row, changed } = await scope.transaction(async (tx) => {
      const current = await findGoal(tx, id, true);
      if (!current.deletedAt) return { row: current, changed: false };
      const [restored] = await tx.update(goals, { deletedAt: null }, eq(goals.id, id));
      await tx.update(entities, { deletedAt: null }, eq(entities.id, id));
      if (!restored) throw goalNotFound();
      return { row: restored, changed: true };
    });
    return {
      data: await present(scope, row),
      undo: changed ? { action: 'goals.delete', input: { id } } : null,
    };
  }),

  implement(goalActions.setTaskGoal, async ({ scope }, { taskId, goalId }) =>
    scope.transaction(async (tx) => {
      if (goalId !== null) {
        const { changed, previousGoalId } = await putTaskInGoal(tx, taskId, goalId);
        return {
          data: await present(tx, await findGoal(tx, goalId)),
          undo: changed
            ? { action: 'goals.setTaskGoal', input: { taskId, goalId: previousGoalId } }
            : null,
        };
      }
      // Take the task out of the goal it is in (its link is soft-deleted)
      const [task] = await tx.select(tasks, {
        where: and(eq(tasks.id, taskId), scope.isLive(tasks)),
        limit: 1,
      });
      if (!task) throw taskNotFound();
      const goalOf = (await loadTaskGoals(tx, [taskId])).get(taskId);
      if (!goalOf) throw new HttpError(404, 'not_found', 'The task is not in a goal');
      await tx.softDelete(
        links,
        and(
          scope.isLive(links),
          eq(links.relation, 'belongs_to'),
          eq(links.sourceId, taskId),
          eq(links.targetId, goalOf.id),
        ) ?? eq(links.sourceId, taskId),
      );
      return {
        data: await present(tx, await findGoal(tx, goalOf.id)),
        undo: { action: 'goals.setTaskGoal', input: { taskId, goalId: goalOf.id } },
      };
    }),
  ),
];
