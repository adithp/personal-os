import { taskActions, type TaskBlocker } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * Task dependencies (links with relation "blocks").
 * CONTRACT STUBS: the signatures are fixed now; the Feature 3 server-dev agent implements them
 * and owns this file. Until then nothing is ever blocked.
 */

/** For each task id, the unfinished, live tasks that block it. Tasks with no blockers are absent. */
export function loadBlockers(
  _scope: UserScope,
  _taskIds: readonly string[],
): Promise<Map<string, TaskBlocker[]>> {
  return Promise.resolve(new Map<string, TaskBlocker[]>());
}

/** Throws HttpError(409, 'blocked', ...) when the task has unfinished blockers. */
export function assertNotBlocked(_scope: UserScope, _taskId: string): Promise<void> {
  return Promise.resolve();
}

/**
 * tasks.addBlocker / tasks.removeBlocker: a link with relation "blocks" from the blocker (source)
 * to the blocked task (target). Refuses a task blocking itself and any cycle (A blocks B blocks A,
 * or longer). Each one's undo is the other.
 * CONTRACT STUB: the Feature 3 server-dev agent implements them.
 */
export const dependencyImplementations = [
  implement(taskActions.addBlocker, () => {
    throw new HttpError(501, 'not_implemented', 'Blockers are not built yet');
  }),
  implement(taskActions.removeBlocker, () => {
    throw new HttpError(501, 'not_implemented', 'Blockers are not built yet');
  }),
];
