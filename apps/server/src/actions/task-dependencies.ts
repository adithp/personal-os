import type { TaskBlocker } from '@personal-os/shared';
import type { UserScope } from '../lib/user-scope';

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
