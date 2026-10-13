import { z } from 'zod';
import { defineAction } from './actions';

/**
 * Goals of the Tasks module (Feature 8, research memo docs/design/research/tasks-goals.md).
 * A goal is an entity (type `goal`) with a row in the goals table. Tasks join a goal through a
 * `belongs_to` link (task to goal); a task is in at most one goal; only top-level tasks count.
 */
export const GOAL_STATUSES = ['active', 'achieved', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const goalStatusSchema = z.enum(GOAL_STATUSES);

export const GOAL_TITLE_MAX = 200;
export const GOAL_DESCRIPTION_MAX = 20000;
export const MAX_TASKS_PER_GOAL = 500;

/** Progress of a goal: done and total over its linked, top-level, counted tasks (memo D4). */
export const goalProgressSchema = z.object({
  done: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type GoalProgress = z.infer<typeof goalProgressSchema>;

const isoTime = z.iso.datetime({ offset: true });

/** A goal as the API returns it. `targetAt` is the start of the target day in India time. */
export const goalSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  targetAt: isoTime.nullable(),
  status: goalStatusSchema,
  closedAt: isoTime.nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
  progress: goalProgressSchema,
});
export type Goal = z.infer<typeof goalSchema>;

/** What a task carries about its goal (null when it has none). */
export const taskGoalSchema = z.object({ id: z.uuid(), title: z.string() });
export type TaskGoal = z.infer<typeof taskGoalSchema>;

const title = z.string().trim().min(1, 'Title is required').max(GOAL_TITLE_MAX);
const description = z.string().max(GOAL_DESCRIPTION_MAX).nullable();
const id = z.uuid();

export const listGoalsInput = z.object({ status: goalStatusSchema.optional() });
export const goalIdInput = z.object({ id });

export const createGoalInput = z.object({
  title,
  description: description.optional(),
  targetAt: isoTime.nullable().optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalInput>;

export const updateGoalInput = z
  .object({
    id,
    title: title.optional(),
    description: description.optional(),
    targetAt: isoTime.nullable().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined || input.description !== undefined || input.targetAt !== undefined,
    { message: 'Nothing to change' },
  );
export type UpdateGoalInput = z.infer<typeof updateGoalInput>;

/** `closedAt` is only sent by the undo, to put the old time back. */
export const setGoalStatusInput = z.object({
  id,
  status: goalStatusSchema,
  closedAt: isoTime.nullable().optional(),
});
export type SetGoalStatusInput = z.infer<typeof setGoalStatusInput>;

/** Put a task in a goal, move it to another, or take it out (goalId null). */
export const setTaskGoalInput = z.object({ taskId: id, goalId: id.nullable() });
export type SetTaskGoalInput = z.infer<typeof setTaskGoalInput>;

export const goalActions = {
  list: defineAction({
    name: 'goals.list',
    description:
      'List goals (optionally only active, achieved, or dropped ones) with their progress.',
    permission: 'read',
    input: listGoalsInput,
  }),
  get: defineAction({
    name: 'goals.get',
    description: 'Get one goal with its progress.',
    permission: 'read',
    input: goalIdInput,
  }),
  create: defineAction({
    name: 'goals.create',
    description: 'Create a goal (a title, optional notes and target date).',
    permission: 'write',
    input: createGoalInput,
  }),
  update: defineAction({
    name: 'goals.update',
    description: 'Change the title, notes, or target date of a goal.',
    permission: 'write',
    input: updateGoalInput,
  }),
  setStatus: defineAction({
    name: 'goals.setStatus',
    description: 'Mark a goal achieved or dropped, or make it active again.',
    permission: 'write',
    input: setGoalStatusInput,
  }),
  delete: defineAction({
    name: 'goals.delete',
    description: 'Delete a goal (its tasks stay). It can be restored.',
    permission: 'destructive',
    input: goalIdInput,
  }),
  restore: defineAction({
    name: 'goals.restore',
    description: 'Bring back a deleted goal.',
    permission: 'write',
    input: goalIdInput,
  }),
  setTaskGoal: defineAction({
    name: 'goals.setTaskGoal',
    description: 'Put a task in a goal, move it to another goal, or take it out of its goal.',
    permission: 'write',
    input: setTaskGoalInput,
  }),
} as const;

/** What a write route for goals returns. */
export interface GoalWriteResult {
  item: Goal;
  undo: { action: string; input: Record<string, unknown> } | null;
}

/** Whole percent of the progress, or null when there are no tasks (no bar, no percent). */
export function goalPercent(progress: GoalProgress): number | null {
  return progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
}

/** True when the app should ask "Mark as achieved?": active, has tasks, all of them done. */
export function canMarkAchieved(goal: Pick<Goal, 'status' | 'progress'>): boolean {
  return (
    goal.status === 'active' &&
    goal.progress.total > 0 &&
    goal.progress.done === goal.progress.total
  );
}
