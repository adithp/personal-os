import { entities, tasks, type TaskRow } from '@personal-os/db';
import { taskActions, type Task, type TaskStatus, type UndoDescriptor } from '@personal-os/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement, type ActionOutcome } from './registry';

/** Gap between positions. Moving a task later puts it between its neighbours. */
const POSITION_STEP = 1024;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** The database row as the API returns it. */
export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    // The database only allows 1 to 4
    priority: row.priority as Task['priority'],
    dueAt: iso(row.dueAt),
    dueAllDay: row.dueAllDay,
    reminderAt: iso(row.reminderAt),
    recurrenceRule: row.recurrenceRule,
    parentTaskId: row.parentTaskId,
    position: row.position,
    completedAt: iso(row.completedAt),
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Filled in by the Feature 1 server work (tags, subtask counts) and Feature 3 (blockedBy).
    tags: [],
    subtaskCount: 0,
    subtasksDone: 0,
    blockedBy: [],
  };
}

const notFound = () => new HttpError(404, 'not_found', 'Task not found');

/** A task of this user that is not deleted (or, with includeDeleted, a deleted one too). */
async function findTask(scope: UserScope, id: string, includeDeleted = false): Promise<TaskRow> {
  const condition = includeDeleted ? eq(tasks.id, id) : and(eq(tasks.id, id), scope.isLive(tasks));
  const [row] = await scope.select(tasks, { where: condition, limit: 1 });
  if (!row) throw notFound();
  return row;
}

async function nextPosition(scope: UserScope): Promise<number> {
  const [last] = await scope.select(tasks, {
    where: scope.isLive(tasks),
    orderBy: desc(tasks.position),
    limit: 1,
  });
  return (last?.position ?? 0) + POSITION_STEP;
}

function orderFor(sort: string, order: 'asc' | 'desc'): SQL[] {
  const direction = order === 'asc' ? asc : desc;
  const column = {
    position: tasks.position,
    dueAt: tasks.dueAt,
    priority: tasks.priority,
    createdAt: tasks.createdAt,
    title: tasks.title,
  }[sort];
  const main =
    sort === 'dueAt'
      ? // Tasks without a due date always come last
        sql`${tasks.dueAt} ${order === 'asc' ? sql`asc` : sql`desc`} nulls last`
      : direction(column ?? tasks.position);
  return [main, asc(tasks.position), asc(tasks.createdAt)];
}

interface Patch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: 1 | 2 | 3 | 4;
  dueAt?: string | null;
  reminderAt?: string | null;
}

/** Applies a change to one task and works out how to put it back. */
async function applyChange(
  scope: UserScope,
  id: string,
  patch: Patch,
): Promise<ActionOutcome<Task>> {
  return scope.transaction(async (tx) => {
    const current = await findTask(tx, id);
    const values: Partial<typeof tasks.$inferInsert> = {};
    const previous: Record<string, unknown> = {};

    // Records a change only when the new value differs from what is stored
    const change = (key: keyof Patch, next: unknown, before: unknown, column: typeof values) => {
      if (next === undefined || JSON.stringify(next) === JSON.stringify(before)) return;
      Object.assign(values, column);
      previous[key] = before;
    };

    change('title', patch.title, current.title, { title: patch.title });
    change('description', patch.description, current.description, {
      description: patch.description,
    });
    change('priority', patch.priority, current.priority, { priority: patch.priority });
    change('dueAt', patch.dueAt, iso(current.dueAt), {
      dueAt: patch.dueAt ? new Date(patch.dueAt) : null,
    });
    change('reminderAt', patch.reminderAt, iso(current.reminderAt), {
      reminderAt: patch.reminderAt ? new Date(patch.reminderAt) : null,
    });
    change('status', patch.status, current.status, {
      status: patch.status,
      completedAt: patch.status === 'done' ? new Date() : null,
    });

    if (Object.keys(values).length === 0) return { data: toTask(current), undo: null };

    const [updated] = await tx.update(tasks, values, eq(tasks.id, id));
    if (!updated) throw notFound();
    if (values.title !== undefined) {
      await tx.update(entities, { title: values.title }, eq(entities.id, id));
    }
    const undo: UndoDescriptor = { action: 'tasks.update', input: { id, ...previous } };
    return { data: toTask(updated), undo };
  });
}

export const taskImplementations = [
  implement(taskActions.list, async ({ scope }, input) => {
    const statuses =
      input.status === undefined
        ? undefined
        : Array.isArray(input.status)
          ? input.status
          : [input.status];
    const where = and(
      scope.isLive(tasks),
      input.archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt),
      statuses && statuses.length > 0 ? inArray(tasks.status, statuses) : undefined,
    );
    const rows = await scope.select(tasks, {
      where,
      orderBy: orderFor(input.sort, input.order),
      limit: input.limit,
      offset: input.offset,
    });
    return { data: rows.map(toTask) };
  }),

  implement(taskActions.get, async ({ scope }, { id }) => ({
    data: toTask(await findTask(scope, id)),
  })),

  implement(taskActions.create, async ({ scope }, input) => {
    const row = await scope.transaction(async (tx) => {
      const [entity] = await tx.insert(entities, { type: 'task', title: input.title });
      if (!entity) throw new Error('Could not create the task');
      const status = input.status ?? 'todo';
      const [created] = await tx.insert(tasks, {
        id: entity.id,
        title: input.title,
        description: input.description ?? null,
        status,
        priority: input.priority ?? 4,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
        position: await nextPosition(tx),
        completedAt: status === 'done' ? new Date() : null,
      });
      if (!created) throw new Error('Could not create the task');
      return created;
    });
    return { data: toTask(row), undo: { action: 'tasks.delete', input: { id: row.id } } };
  }),

  implement(taskActions.update, async ({ scope }, { id, ...patch }) =>
    applyChange(scope, id, patch),
  ),

  implement(taskActions.complete, async ({ scope }, { id }) =>
    applyChange(scope, id, { status: 'done' }),
  ),

  implement(taskActions.prioritize, async ({ scope }, { id, priority }) =>
    applyChange(scope, id, { priority }),
  ),

  implement(taskActions.delete, async ({ scope }, { id }) => {
    const row = await scope.transaction(async (tx) => {
      await findTask(tx, id);
      const [deleted] = await tx.softDelete(tasks, eq(tasks.id, id));
      await tx.softDelete(entities, eq(entities.id, id));
      if (!deleted) throw notFound();
      return deleted;
    });
    return { data: toTask(row), undo: { action: 'tasks.restore', input: { id } } };
  }),

  implement(taskActions.restore, async ({ scope }, { id }) => {
    const row = await scope.transaction(async (tx) => {
      const current = await findTask(tx, id, true);
      if (!current.deletedAt) return current;
      const [restored] = await tx.update(tasks, { deletedAt: null }, eq(tasks.id, id));
      await tx.update(entities, { deletedAt: null }, eq(entities.id, id));
      if (!restored) throw notFound();
      return restored;
    });
    return { data: toTask(row), undo: { action: 'tasks.delete', input: { id } } };
  }),
];
