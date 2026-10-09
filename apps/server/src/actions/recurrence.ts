import type { TaskRow } from '@personal-os/db';
import { taskActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * Recurring tasks.
 * CONTRACT STUB: the signature is fixed now; the Feature 3 server-dev agent implements it and owns
 * this file. Until then completing a task never creates a next copy.
 */

/**
 * Called when a task with a recurrence rule has just been completed. Creates the next copy, due
 * on the first occurrence of the rule after both the old due date and `now` (Asia/Kolkata), and
 * returns it, or returns null when the task does not repeat.
 */
export function spawnNextOccurrence(
  _scope: UserScope,
  _completed: TaskRow,
  _now: Date,
): Promise<TaskRow | null> {
  return Promise.resolve(null);
}

/**
 * tasks.reopen (the undo of completing a repeating task): restores the old values through
 * applyChange in tasks.ts and soft-deletes the copies in `removeIds`, in one transaction. Its own
 * undo is null.
 * CONTRACT STUB: the Feature 3 server-dev agent implements it.
 */
export const recurrenceImplementations = [
  implement(taskActions.reopen, () => {
    throw new HttpError(501, 'not_implemented', 'Reopening is not built yet');
  }),
];
