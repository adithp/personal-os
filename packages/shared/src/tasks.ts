import { z } from 'zod';
import { defineAction, type UndoDescriptor } from './actions';

/** Where a task is on the board (docs/features/tasks.md). */
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** 1 is the most urgent, 4 the least. */
export const TASK_PRIORITIES = [1, 2, 3, 4] as const;
export const DEFAULT_TASK_PRIORITY = 4;
export const taskPrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

export const TASK_TITLE_MAX = 500;
export const TASK_DESCRIPTION_MAX = 20000;

/** A time as sent over the API: ISO 8601 in UTC (e.g. 2025-10-07T11:30:00.000Z). */
const isoTime = z.iso.datetime({ offset: true });

/** A task as the API returns it. Times are ISO strings in UTC. */
export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: isoTime.nullable(),
  reminderAt: isoTime.nullable(),
  recurrenceRule: z.string().nullable(),
  parentTaskId: z.uuid().nullable(),
  position: z.number(),
  completedAt: isoTime.nullable(),
  archivedAt: isoTime.nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type Task = z.infer<typeof taskSchema>;

const title = z.string().trim().min(1, 'Title is required').max(TASK_TITLE_MAX);
const description = z.string().max(TASK_DESCRIPTION_MAX).nullable();

/** What you may send to create a task. */
export const createTaskInput = z.object({
  title,
  description: description.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: isoTime.nullable().optional(),
  reminderAt: isoTime.nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

const taskId = z.uuid();

/** The fields of a task that can be changed. null clears a description or a date. */
const editableFields = {
  title: title.optional(),
  description: description.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: isoTime.nullable().optional(),
  reminderAt: isoTime.nullable().optional(),
};

export const EDITABLE_TASK_FIELDS = Object.keys(editableFields) as (keyof typeof editableFields)[];

/** Change a task: its id plus at least one field to change. */
export const updateTaskInput = z
  .object({ id: taskId, ...editableFields })
  .refine((input) => EDITABLE_TASK_FIELDS.some((field) => input[field] !== undefined), {
    message: 'Nothing to change',
  });
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export const TASK_SORTS = ['position', 'dueAt', 'priority', 'createdAt', 'title'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;
export const TASK_LIST_DEFAULT_LIMIT = 500;
export const TASK_LIST_MAX_LIMIT = 1000;

/** "true" / "false" from a query string, or a real boolean. */
const flag = z.union([z.boolean(), z.stringbool()]);

/** Filters for the list. Query-string values (all text) are accepted as well as real values. */
export const listTasksInput = z.object({
  status: z.union([taskStatusSchema, z.array(taskStatusSchema)]).optional(),
  /** false (default): active tasks. true: archived tasks only. */
  archived: flag.default(false),
  sort: z.enum(TASK_SORTS).default('position'),
  order: z.enum(SORT_ORDERS).default('asc'),
  limit: z.coerce.number().int().min(1).max(TASK_LIST_MAX_LIMIT).default(TASK_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTasksInput = z.input<typeof listTasksInput>;

export const taskIdInput = z.object({ id: taskId });
export const prioritizeTaskInput = z.object({ id: taskId, priority: taskPrioritySchema });

/** Actions on tasks (docs/features/tasks.md). Implemented in apps/server/src/actions/tasks.ts. */
export const taskActions = {
  list: defineAction({
    name: 'tasks.list',
    description: 'List tasks, with optional status filter, sort, and paging.',
    permission: 'read',
    input: listTasksInput,
  }),
  get: defineAction({
    name: 'tasks.get',
    description: 'Get one task by id.',
    permission: 'read',
    input: taskIdInput,
  }),
  create: defineAction({
    name: 'tasks.create',
    description: 'Create a task.',
    permission: 'write',
    input: createTaskInput,
  }),
  update: defineAction({
    name: 'tasks.update',
    description: 'Change fields of a task (title, description, status, priority, dates).',
    permission: 'write',
    input: updateTaskInput,
  }),
  complete: defineAction({
    name: 'tasks.complete',
    description: 'Mark a task done.',
    permission: 'write',
    input: taskIdInput,
  }),
  prioritize: defineAction({
    name: 'tasks.prioritize',
    description: 'Set the priority of a task (1 urgent … 4 low).',
    permission: 'write',
    input: prioritizeTaskInput,
  }),
  delete: defineAction({
    name: 'tasks.delete',
    description: 'Delete a task. It can be restored.',
    permission: 'destructive',
    input: taskIdInput,
  }),
  restore: defineAction({
    name: 'tasks.restore',
    description: 'Bring back a deleted task.',
    permission: 'write',
    input: taskIdInput,
  }),
} as const;

/** What a write route returns: the changed task and how to undo the change. */
export interface TaskWriteResult {
  item: Task;
  undo: UndoDescriptor | null;
}
