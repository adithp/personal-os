import { entities, entityTags, tags, tasks, type TaskRow } from '@personal-os/db';
import {
  taskActions,
  type Task,
  type TaskStatus,
  type TagRef,
  type UndoDescriptor,
} from '@personal-os/shared';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { spawnNextOccurrence } from './recurrence';
import { assertNotBlocked, loadBlockers } from './task-dependencies';
import { implement, type ActionOutcome } from './registry';

/** Gap between positions. Moving a task later puts it between its neighbours. */
const POSITION_STEP = 1024;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** The database row as the API returns it, without the tags and counts (see withDetails). */
export function toTask(
  row: TaskRow,
  extra: Partial<Pick<Task, 'tags' | 'subtaskCount' | 'subtasksDone' | 'blockedBy'>> = {},
): Task {
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
    tags: extra.tags ?? [],
    subtaskCount: extra.subtaskCount ?? 0,
    subtasksDone: extra.subtasksDone ?? 0,
    blockedBy: extra.blockedBy ?? [],
  };
}

/** The live tags of each task, ordered by tag name. One query for the links, one for the tags. */
async function loadTags(scope: UserScope, taskIds: string[]): Promise<Map<string, TagRef[]>> {
  const result = new Map<string, TagRef[]>();
  if (taskIds.length === 0) return result;
  const links = await scope.select(entityTags, { where: inArray(entityTags.entityId, taskIds) });
  if (links.length === 0) return result;
  const tagRows = await scope.select(tags, {
    where: and(scope.isLive(tags), inArray(tags.id, [...new Set(links.map((link) => link.tagId))])),
  });
  const byId = new Map(tagRows.map((tag) => [tag.id, tag]));
  for (const link of links) {
    const tag = byId.get(link.tagId);
    if (!tag) continue;
    const list = result.get(link.entityId) ?? [];
    list.push({ id: tag.id, name: tag.name, color: tag.color });
    result.set(link.entityId, list);
  }
  for (const list of result.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
  return result;
}

/** Adds tags, subtask counts and blockers to rows, with a fixed number of queries. */
export async function withDetails(scope: UserScope, rows: TaskRow[]): Promise<Task[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [tagMap, subtasks, blockers] = await Promise.all([
    loadTags(scope, ids),
    scope.select(tasks, { where: and(scope.isLive(tasks), inArray(tasks.parentTaskId, ids)) }),
    loadBlockers(scope, ids),
  ]);
  const counts = new Map<string, { total: number; done: number }>();
  for (const sub of subtasks) {
    if (!sub.parentTaskId) continue;
    const count = counts.get(sub.parentTaskId) ?? { total: 0, done: 0 };
    count.total += 1;
    if (sub.status === 'done') count.done += 1;
    counts.set(sub.parentTaskId, count);
  }
  return rows.map((row) =>
    toTask(row, {
      tags: tagMap.get(row.id),
      subtaskCount: counts.get(row.id)?.total,
      subtasksDone: counts.get(row.id)?.done,
      blockedBy: blockers.get(row.id),
    }),
  );
}

async function detailed(scope: UserScope, row: TaskRow): Promise<Task> {
  const [task] = await withDetails(scope, [row]);
  if (!task) throw new Error('Could not load the task');
  return task;
}

const notFound = () => new HttpError(404, 'not_found', 'Task not found');
const tagNotFound = () => new HttpError(404, 'not_found', 'Tag not found');

/** A task of this user that is not deleted (or, with includeDeleted, a deleted one too). */
async function findTask(scope: UserScope, id: string, includeDeleted = false): Promise<TaskRow> {
  const condition = includeDeleted ? eq(tasks.id, id) : and(eq(tasks.id, id), scope.isLive(tasks));
  const [row] = await scope.select(tasks, { where: condition, limit: 1 });
  if (!row) throw notFound();
  return row;
}

/** The position after the last live task among the same siblings (top level or one parent). */
async function nextPosition(scope: UserScope, parentTaskId: string | null): Promise<number> {
  const [last] = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      parentTaskId ? eq(tasks.parentTaskId, parentTaskId) : isNull(tasks.parentTaskId),
    ),
    orderBy: desc(tasks.position),
    limit: 1,
  });
  return (last?.position ?? 0) + POSITION_STEP;
}

/** Checks that every id is one of the user's live tags. Returns the ids without duplicates. */
async function checkTagIds(scope: UserScope, tagIds: readonly string[]): Promise<string[]> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return unique;
  const found = await scope.select(tags, {
    where: and(scope.isLive(tags), inArray(tags.id, unique)),
  });
  if (found.length !== unique.length) throw tagNotFound();
  return unique;
}

async function currentTagIds(scope: UserScope, taskId: string): Promise<string[]> {
  return (await loadTags(scope, [taskId])).get(taskId)?.map((tag) => tag.id) ?? [];
}

/** Makes the task's tags exactly these (the ids are already checked). */
async function setTags(scope: UserScope, taskId: string, tagIds: readonly string[]) {
  const existing = await scope.select(entityTags, { where: eq(entityTags.entityId, taskId) });
  const have = new Set(existing.map((link) => link.tagId));
  const want = new Set(tagIds);
  const remove = existing.filter((link) => !want.has(link.tagId)).map((link) => link.id);
  if (remove.length > 0) await scope.delete(entityTags, inArray(entityTags.id, remove));
  const add = tagIds.filter((tagId) => !have.has(tagId));
  if (add.length > 0) {
    await scope.insert(
      entityTags,
      add.map((tagId) => ({ entityId: taskId, tagId })),
    );
  }
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
  dueAllDay?: boolean;
  reminderAt?: string | null;
  tagIds?: string[];
}

/** Applies a change to one task and works out how to put it back. */
async function applyChange(
  scope: UserScope,
  id: string,
  patch: Patch,
  options: { spawnNext?: boolean } = {},
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

    // The date and the all-day flag must agree in the final state
    const finalDueAt = patch.dueAt !== undefined ? patch.dueAt : iso(current.dueAt);
    let nextAllDay = patch.dueAllDay;
    if (nextAllDay === undefined && finalDueAt === null && current.dueAllDay) {
      // Clearing the date of an all-day task clears the flag too
      nextAllDay = false;
    }
    if ((nextAllDay ?? current.dueAllDay) && !finalDueAt) {
      throw new HttpError(400, 'validation_error', 'An all-day task needs a due date');
    }

    change('title', patch.title, current.title, { title: patch.title });
    change('description', patch.description, current.description, {
      description: patch.description,
    });
    change('priority', patch.priority, current.priority, { priority: patch.priority });
    change('dueAt', patch.dueAt, iso(current.dueAt), {
      dueAt: patch.dueAt ? new Date(patch.dueAt) : null,
    });
    change('dueAllDay', nextAllDay, current.dueAllDay, { dueAllDay: nextAllDay });
    change('reminderAt', patch.reminderAt, iso(current.reminderAt), {
      reminderAt: patch.reminderAt ? new Date(patch.reminderAt) : null,
    });
    const completing = patch.status === 'done' && current.status !== 'done';
    if (completing) await assertNotBlocked(tx, id);
    change('status', patch.status, current.status, {
      status: patch.status,
      completedAt: patch.status === 'done' ? new Date() : null,
    });

    let tagIds: string[] | undefined;
    if (patch.tagIds !== undefined) {
      tagIds = await checkTagIds(tx, patch.tagIds);
      const before = await currentTagIds(tx, id);
      if (JSON.stringify([...tagIds].sort()) !== JSON.stringify([...before].sort())) {
        previous.tagIds = before;
      } else {
        tagIds = undefined;
      }
    }

    if (Object.keys(values).length === 0 && tagIds === undefined) {
      return { data: await detailed(tx, current), undo: null };
    }

    let updated: TaskRow | undefined = current;
    if (Object.keys(values).length > 0) {
      [updated] = await tx.update(tasks, values, eq(tasks.id, id));
      if (!updated) throw notFound();
      if (values.title !== undefined) {
        await tx.update(entities, { title: values.title }, eq(entities.id, id));
      }
    }
    if (tagIds !== undefined) await setTags(tx, id, tagIds);
    if (options.spawnNext && completing && updated.recurrenceRule) {
      await spawnNextOccurrence(tx, updated, new Date());
    }
    const undo: UndoDescriptor = { action: 'tasks.update', input: { id, ...previous } };
    return { data: await detailed(tx, updated), undo };
  });
}

async function setArchived(scope: UserScope, id: string, archive: boolean) {
  return scope.transaction(async (tx) => {
    const current = await findTask(tx, id);
    if (Boolean(current.archivedAt) === archive) {
      return { data: await detailed(tx, current), undo: null };
    }
    const [updated] = await tx.update(
      tasks,
      { archivedAt: archive ? new Date() : null },
      eq(tasks.id, id),
    );
    if (!updated) throw notFound();
    const undo: UndoDescriptor = {
      action: archive ? 'tasks.unarchive' : 'tasks.archive',
      input: { id },
    };
    return { data: await detailed(tx, updated), undo };
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
    const priorities =
      input.priority === undefined
        ? undefined
        : Array.isArray(input.priority)
          ? input.priority
          : [input.priority];
    const tagIds =
      input.tagId === undefined
        ? undefined
        : Array.isArray(input.tagId)
          ? input.tagId
          : [input.tagId];

    let taskIdsWithTag: string[] | undefined;
    if (tagIds && tagIds.length > 0) {
      const links = await scope.select(entityTags, { where: inArray(entityTags.tagId, tagIds) });
      taskIdsWithTag = [...new Set(links.map((link) => link.entityId))];
      if (taskIdsWithTag.length === 0) return { data: [] };
    }

    const where = and(
      scope.isLive(tasks),
      input.archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt),
      input.parent === 'none' ? isNull(tasks.parentTaskId) : eq(tasks.parentTaskId, input.parent),
      statuses && statuses.length > 0 ? inArray(tasks.status, statuses) : undefined,
      priorities && priorities.length > 0 ? inArray(tasks.priority, priorities) : undefined,
      taskIdsWithTag ? inArray(tasks.id, taskIdsWithTag) : undefined,
      input.dueFrom ? gte(tasks.dueAt, new Date(input.dueFrom)) : undefined,
      input.dueTo ? lt(tasks.dueAt, new Date(input.dueTo)) : undefined,
      input.noDate ? isNull(tasks.dueAt) : undefined,
      input.completedAfter ? gte(tasks.completedAt, new Date(input.completedAfter)) : undefined,
      input.completedBefore ? lt(tasks.completedAt, new Date(input.completedBefore)) : undefined,
    );
    const rows = await scope.select(tasks, {
      where,
      orderBy: orderFor(input.sort, input.order),
      limit: input.limit,
      offset: input.offset,
    });
    return { data: await withDetails(scope, rows) };
  }),

  implement(taskActions.get, async ({ scope }, { id }) => ({
    data: await detailed(scope, await findTask(scope, id)),
  })),

  implement(taskActions.create, async ({ scope }, input) => {
    const row = await scope.transaction(async (tx) => {
      if (input.parentTaskId) {
        const parent = await findTask(tx, input.parentTaskId);
        if (parent.parentTaskId) {
          throw new HttpError(400, 'validation_error', 'Subtasks go one level deep only');
        }
      }
      const tagIds = await checkTagIds(tx, input.tagIds ?? []);
      const parentTaskId = input.parentTaskId ?? null;
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
        dueAllDay: input.dueAllDay ?? false,
        reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
        parentTaskId,
        position: await nextPosition(tx, parentTaskId),
        completedAt: status === 'done' ? new Date() : null,
      });
      if (!created) throw new Error('Could not create the task');
      await setTags(tx, created.id, tagIds);
      return created;
    });
    return {
      data: await detailed(scope, row),
      undo: { action: 'tasks.delete', input: { id: row.id } },
    };
  }),

  implement(taskActions.update, async ({ scope }, { id, ...patch }) =>
    applyChange(scope, id, patch),
  ),

  implement(taskActions.archive, async ({ scope }, { id }) => setArchived(scope, id, true)),

  implement(taskActions.unarchive, async ({ scope }, { id }) => setArchived(scope, id, false)),

  implement(taskActions.complete, async ({ scope }, { id }) =>
    applyChange(scope, id, { status: 'done' }, { spawnNext: true }),
  ),

  implement(taskActions.prioritize, async ({ scope }, { id, priority }) =>
    applyChange(scope, id, { priority }),
  ),

  // Subtasks are not touched: they are only reachable through their parent.
  implement(taskActions.delete, async ({ scope }, { id }) => {
    const row = await scope.transaction(async (tx) => {
      await findTask(tx, id);
      const [deleted] = await tx.softDelete(tasks, eq(tasks.id, id));
      await tx.softDelete(entities, eq(entities.id, id));
      if (!deleted) throw notFound();
      return deleted;
    });
    return { data: await detailed(scope, row), undo: { action: 'tasks.restore', input: { id } } };
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
    return { data: await detailed(scope, row), undo: { action: 'tasks.delete', input: { id } } };
  }),
];
