import { links, tasks, type TaskRow } from '@personal-os/db';
import { taskActions, type TaskBlocker } from '@personal-os/shared';
import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';
import { withDetails } from './tasks';

/**
 * Task dependencies: a live link with relation "blocks" from the blocker (source) to the blocked
 * task (target). Tasks and entities share ids. Removing a dependency soft-deletes the link (the
 * unique index only covers live links, so it can be added again).
 */

/**
 * For each task id, the unfinished, live tasks that block it, sorted by title then id. Tasks with no
 * blockers are absent. An archived blocker still blocks. Two queries for any number of ids.
 */
export async function loadBlockers(
  scope: UserScope,
  taskIds: readonly string[],
): Promise<Map<string, TaskBlocker[]>> {
  const result = new Map<string, TaskBlocker[]>();
  if (taskIds.length === 0) return result;
  const rows = await scope.select(links, {
    where: and(
      scope.isLive(links),
      eq(links.relation, 'blocks'),
      inArray(links.targetId, [...taskIds]),
    ),
  });
  if (rows.length === 0) return result;
  const blockers = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      ne(tasks.status, 'done'),
      inArray(tasks.id, [...new Set(rows.map((row) => row.sourceId))]),
    ),
  });
  const byId = new Map(blockers.map((task) => [task.id, task]));
  for (const row of rows) {
    const blocker = byId.get(row.sourceId);
    if (!blocker) continue;
    const list = result.get(row.targetId) ?? [];
    list.push({ id: blocker.id, title: blocker.title });
    result.set(row.targetId, list);
  }
  for (const list of result.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }
  return result;
}

/** Throws HttpError(409, 'blocked', ...) when the task has unfinished blockers. */
export async function assertNotBlocked(scope: UserScope, taskId: string): Promise<void> {
  const blockers = (await loadBlockers(scope, [taskId])).get(taskId);
  if (!blockers || blockers.length === 0) return;
  throw new HttpError(
    409,
    'blocked',
    `Blocked by: ${blockers.map((blocker) => blocker.title).join(', ')}`,
  );
}

const notFound = () => new HttpError(404, 'not_found', 'Task not found');

async function findLiveTask(scope: UserScope, id: string): Promise<TaskRow> {
  const [row] = await scope.select(tasks, {
    where: and(eq(tasks.id, id), scope.isLive(tasks)),
    limit: 1,
  });
  if (!row) throw notFound();
  return row;
}

/** True when `from` already blocks `to`, directly or through a chain of live links. */
async function reaches(scope: UserScope, from: string, to: string): Promise<boolean> {
  const rows = await scope.select(links, {
    where: and(scope.isLive(links), eq(links.relation, 'blocks')),
  });
  const next = new Map<string, string[]>();
  for (const row of rows) next.set(row.sourceId, [...(next.get(row.sourceId) ?? []), row.targetId]);
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const target of next.get(current) ?? []) {
      if (target === to) return true;
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return false;
}

/** The live "blocks" link from the blocker to the blocked task. */
const linkCondition = (scope: UserScope, blockerId: string, id: string): SQL =>
  sql`${scope.isLive(links)} and ${eq(links.relation, 'blocks')} and ${eq(links.sourceId, blockerId)} and ${eq(links.targetId, id)}`;

async function detailed(scope: UserScope, row: TaskRow) {
  const [task] = await withDetails(scope, [row]);
  if (!task) throw new Error('Could not load the task');
  return task;
}

/**
 * tasks.addBlocker / tasks.removeBlocker. Refuses a task blocking itself and any cycle (A blocks B
 * blocks A, or longer). Each one's undo is the other.
 */
export const dependencyImplementations = [
  implement(taskActions.addBlocker, async ({ scope }, { id, blockerId }) => {
    if (id === blockerId) {
      throw new HttpError(400, 'validation_error', 'A task cannot block itself');
    }
    return scope.transaction(async (tx) => {
      const blocked = await findLiveTask(tx, id);
      await findLiveTask(tx, blockerId);
      const undo = { action: 'tasks.removeBlocker', input: { id, blockerId } };
      const [existing] = await tx.select(links, {
        where: linkCondition(tx, blockerId, id),
        limit: 1,
      });
      if (existing) {
        return { data: await detailed(tx, blocked), undo: null };
      }
      if (await reaches(tx, id, blockerId)) {
        throw new HttpError(
          409,
          'circular_dependency',
          'That would make the tasks wait for each other',
        );
      }
      await tx.insert(links, { sourceId: blockerId, targetId: id, relation: 'blocks' });
      return { data: await detailed(tx, blocked), undo };
    });
  }),

  implement(taskActions.removeBlocker, async ({ scope }, { id, blockerId }) =>
    scope.transaction(async (tx) => {
      const blocked = await findLiveTask(tx, id);
      const removed = await tx.softDelete(links, linkCondition(tx, blockerId, id));
      return {
        data: await detailed(tx, blocked),
        undo: removed.length > 0 ? { action: 'tasks.addBlocker', input: { id, blockerId } } : null,
      };
    }),
  ),
];
