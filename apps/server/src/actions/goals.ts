import { goalActions, type GoalProgress, type TaskGoal } from '@personal-os/shared';
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
 * CONTRACT STUBS: the Feature 8 server-dev agent implements them and owns this file.
 */

/** For each goal id, its progress. Goals without tasks have { done: 0, total: 0 }. */
export function loadGoalProgress(
  _scope: UserScope,
  goalIds: readonly string[],
): Promise<Map<string, GoalProgress>> {
  return Promise.resolve(new Map(goalIds.map((id) => [id, { done: 0, total: 0 }])));
}

/** For each task id, the live goal it belongs to (tasks without a goal are absent). */
export function loadTaskGoals(
  _scope: UserScope,
  _taskIds: readonly string[],
): Promise<Map<string, TaskGoal>> {
  return Promise.resolve(new Map<string, TaskGoal>());
}

/** The ids of the live top-level tasks linked to a goal (any status, archived too). */
export function taskIdsOfGoal(_scope: UserScope, _goalId: string): Promise<string[]> {
  return Promise.resolve([]);
}

/** Puts a task in a goal inside the caller's transaction (used by tasks.create with goalId). */
export function linkTaskToGoal(_scope: UserScope, _taskId: string, _goalId: string): Promise<void> {
  return Promise.resolve();
}

const notBuilt = () => {
  throw new HttpError(501, 'not_implemented', 'Goals are not built yet');
};

export const goalImplementations = [
  implement(goalActions.list, notBuilt),
  implement(goalActions.get, notBuilt),
  implement(goalActions.create, notBuilt),
  implement(goalActions.update, notBuilt),
  implement(goalActions.setStatus, notBuilt),
  implement(goalActions.delete, notBuilt),
  implement(goalActions.restore, notBuilt),
  implement(goalActions.setTaskGoal, notBuilt),
];
