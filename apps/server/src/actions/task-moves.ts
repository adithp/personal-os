import { tasks, type TaskRow } from '@personal-os/db';
import { taskActions } from '@personal-os/shared';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';
import { applyChange, POSITION_STEP } from './tasks';

/** Below this gap two positions are too close to put another one between them. */
const MIN_GAP = 1e-6;

const notFound = () => new HttpError(404, 'not_found', 'Task not found');
const invalid = (message: string) => new HttpError(400, 'validation_error', message);

/** The live, not archived tasks under the same parent as the moved task, in manual order. */
function siblingsOf(scope: UserScope, moved: TaskRow): Promise<TaskRow[]> {
  return scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      isNull(tasks.archivedAt),
      ne(tasks.id, moved.id),
      moved.parentTaskId ? eq(tasks.parentTaskId, moved.parentTaskId) : isNull(tasks.parentTaskId),
    ),
    orderBy: [asc(tasks.position), asc(tasks.createdAt)],
  });
}

/** A neighbour must be the user's live task, another task, under the same parent. */
async function neighbour(scope: UserScope, moved: TaskRow, id: string): Promise<TaskRow> {
  if (id === moved.id) throw invalid('A task cannot be placed next to itself');
  const [row] = await scope.select(tasks, {
    where: and(eq(tasks.id, id), scope.isLive(tasks), isNull(tasks.archivedAt)),
    limit: 1,
  });
  if (!row) throw notFound();
  if (row.parentTaskId !== moved.parentTaskId) {
    throw invalid('The neighbour must have the same parent task');
  }
  return row;
}

/** The two positions the moved task goes between; null means open on that side. */
async function bounds(
  scope: UserScope,
  moved: TaskRow,
  afterId: string | undefined,
  beforeId: string | undefined,
): Promise<{ lower: number | null; upper: number | null }> {
  const siblings = await siblingsOf(scope, moved);
  const position = (id: string) => siblings.find((row) => row.id === id)?.position;
  const after = afterId === undefined ? undefined : position(afterId);
  const before = beforeId === undefined ? undefined : position(beforeId);
  if (after !== undefined && before !== undefined) return { lower: after, upper: before };
  if (after !== undefined) {
    return { lower: after, upper: siblings.find((row) => row.position > after)?.position ?? null };
  }
  if (before !== undefined) {
    const lower = [...siblings].reverse().find((row) => row.position < before)?.position ?? null;
    return { lower, upper: before };
  }
  throw notFound();
}

export const taskMoveImplementations = [
  implement(taskActions.move, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      const { id, afterId, beforeId, ...change } = input;
      const [moved] = await tx.select(tasks, {
        where: and(eq(tasks.id, id), tx.isLive(tasks)),
        limit: 1,
      });
      if (!moved) throw notFound();

      let position: number | undefined;
      if (afterId !== undefined || beforeId !== undefined) {
        const after = afterId === undefined ? undefined : await neighbour(tx, moved, afterId);
        const before = beforeId === undefined ? undefined : await neighbour(tx, moved, beforeId);
        if (after && before && after.position >= before.position) {
          throw invalid('afterId must sit above beforeId');
        }

        let range = await bounds(tx, moved, afterId, beforeId);
        if (range.lower !== null && range.upper !== null && range.upper - range.lower < MIN_GAP) {
          const siblings = await siblingsOf(tx, moved);
          for (const [index, sibling] of siblings.entries()) {
            await tx.update(
              tasks,
              { position: (index + 1) * POSITION_STEP },
              eq(tasks.id, sibling.id),
            );
          }
          range = await bounds(tx, moved, afterId, beforeId);
        }
        const { lower, upper } = range;
        if (lower !== null && upper !== null) position = (lower + upper) / 2;
        else if (lower !== null) position = lower + POSITION_STEP;
        else if (upper !== null) position = upper - POSITION_STEP;
      }

      return applyChange(tx, id, { ...change, position });
    }),
  ),
];
