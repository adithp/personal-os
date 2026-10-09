import { z } from 'zod';
import { defineAction, type UndoDescriptor } from './actions';
import { recurrenceRuleSchema } from './recurrence';
import { MAX_TAGS_PER_TASK, tagName, tagRefSchema } from './tags';

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

/** A due date: between the years 2000 and 2100, so repeating a rule from it stays quick. */
const dueTime = isoTime.refine(
  (value) => Date.parse(value) >= Date.UTC(2000, 0, 1) && Date.parse(value) < Date.UTC(2100, 0, 1),
  { message: 'The due date must be between the years 2000 and 2100' },
);

/** A task as the API returns it. Times are ISO strings in UTC. */
export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: isoTime.nullable(),
  reminderAt: isoTime.nullable(),
  /** True: only the date of dueAt counts (stored as the start of that day in India time). */
  dueAllDay: z.boolean(),
  recurrenceRule: z.string().nullable(),
  parentTaskId: z.uuid().nullable(),
  position: z.number(),
  completedAt: isoTime.nullable(),
  archivedAt: isoTime.nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
  tags: z.array(tagRefSchema),
  /** Subtasks that are not deleted. Always 0 for a subtask itself. */
  subtaskCount: z.number().int().min(0),
  subtasksDone: z.number().int().min(0),
  /** Unfinished tasks that block this one. Empty until dependencies arrive. */
  blockedBy: z.array(z.object({ id: z.uuid(), title: z.string() })),
});
export type Task = z.infer<typeof taskSchema>;
export type TaskBlocker = Task['blockedBy'][number];

const title = z.string().trim().min(1, 'Title is required').max(TASK_TITLE_MAX);
const description = z.string().max(TASK_DESCRIPTION_MAX).nullable();

const tagIds = z.array(z.uuid()).max(MAX_TAGS_PER_TASK);

/** What you may send to create a task. A subtask is a task with a parentTaskId (one level only). */
export const createTaskInput = z
  .object({
    title,
    description: description.optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    dueAt: dueTime.nullable().optional(),
    dueAllDay: z.boolean().optional(),
    reminderAt: isoTime.nullable().optional(),
    parentTaskId: z.uuid().optional(),
    tagIds: tagIds.optional(),
    /** Tags by name: each one is found (ignoring capitals) or created. Together with tagIds at most 20. */
    tagNames: z.array(tagName).max(MAX_TAGS_PER_TASK).optional(),
    /** One of the repeat presets (see recurrence.ts). A repeating task needs a due date. */
    recurrenceRule: recurrenceRuleSchema.optional(),
  })
  .refine((input) => !input.dueAllDay || Boolean(input.dueAt), {
    message: 'An all-day task needs a due date',
    path: ['dueAt'],
  })
  .refine((input) => !input.recurrenceRule || Boolean(input.dueAt), {
    message: 'A repeating task needs a due date',
    path: ['dueAt'],
  });
export type CreateTaskInput = z.infer<typeof createTaskInput>;

const taskId = z.uuid();

/** The fields of a task that can be changed. null clears a description or a date. */
const editableFields = {
  title: title.optional(),
  description: description.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: dueTime.nullable().optional(),
  dueAllDay: z.boolean().optional(),
  reminderAt: isoTime.nullable().optional(),
  /** Replaces the task's tags with exactly these. */
  tagIds: tagIds.optional(),
  /** One of the repeat presets, or null to stop repeating. A repeating task needs a due date. */
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
  /** Where the task sits in the manual order (smaller is higher). tasks.move works this out. */
  position: z.number().min(-1e9).max(1e9).optional(),
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

/** One value or a list (a repeated query-string key gives a list). */
const oneOrMany = <T extends z.ZodType>(schema: T) => z.union([schema, z.array(schema)]);

/** Filters for the list. Query-string values (all text) are accepted as well as real values. */
export const listTasksInput = z.object({
  status: oneOrMany(taskStatusSchema).optional(),
  priority: oneOrMany(z.coerce.number().pipe(taskPrioritySchema)).optional(),
  /** Only tasks that have this tag (or any of these tags). */
  tagId: oneOrMany(z.uuid()).optional(),
  /** Due between these times (inclusive start, exclusive end). */
  dueFrom: isoTime.optional(),
  dueTo: isoTime.optional(),
  /** true: only tasks with no due date. */
  noDate: flag.optional(),
  /** Only tasks completed at or after / before these times (for the "Completed" section). */
  completedAfter: isoTime.optional(),
  completedBefore: isoTime.optional(),
  /** Whose children to list: "none" (default) is the top-level tasks, or the id of a parent task. */
  parent: z.union([z.literal('none'), z.uuid()]).default('none'),
  /** false (default): active tasks. true: archived tasks only. */
  archived: flag.default(false),
  sort: z.enum(TASK_SORTS).default('position'),
  order: z.enum(SORT_ORDERS).default('asc'),
  limit: z.coerce.number().int().min(1).max(TASK_LIST_MAX_LIMIT).default(TASK_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTasksInput = z.input<typeof listTasksInput>;

/**
 * Move a task (drag and drop). `afterId` is the task that will sit just above it and `beforeId`
 * the one just below it, in the manual order; the server works out the position between them.
 * The status and the due date may change in the same move (dropping on a column or a section).
 */
export const moveTaskInput = z
  .object({
    id: taskId,
    status: taskStatusSchema.optional(),
    dueAt: dueTime.nullable().optional(),
    dueAllDay: z.boolean().optional(),
    afterId: z.uuid().optional(),
    beforeId: z.uuid().optional(),
  })
  .refine(
    (input) =>
      input.status !== undefined ||
      input.dueAt !== undefined ||
      input.dueAllDay !== undefined ||
      input.afterId !== undefined ||
      input.beforeId !== undefined,
    { message: 'Nothing to move' },
  );
export type MoveTaskInput = z.infer<typeof moveTaskInput>;

/** Make `blockerId` block task `id` (the task cannot be completed until the blocker is done). */
export const blockerInput = z.object({ id: taskId, blockerId: taskId });
export type BlockerInput = z.infer<typeof blockerInput>;

/**
 * The undo of completing a repeating task: puts the old values back (like tasks.update) and removes
 * the copies that completing it created.
 */
export const reopenTaskInput = z.object({
  id: taskId,
  ...editableFields,
  /** Reopening never completes a task. */
  status: z.enum(['todo', 'doing']).optional(),
  removeIds: z.array(taskId).max(10),
});

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
  archive: defineAction({
    name: 'tasks.archive',
    description: 'Archive a task (hide it from the active lists).',
    permission: 'write',
    input: taskIdInput,
  }),
  unarchive: defineAction({
    name: 'tasks.unarchive',
    description: 'Bring an archived task back.',
    permission: 'write',
    input: taskIdInput,
  }),
  complete: defineAction({
    name: 'tasks.complete',
    description: 'Mark a task done.',
    permission: 'write',
    input: taskIdInput,
  }),
  move: defineAction({
    name: 'tasks.move',
    description: 'Move a task: change its place in the order, its status, or its due date.',
    permission: 'write',
    input: moveTaskInput,
  }),
  addBlocker: defineAction({
    name: 'tasks.addBlocker',
    description:
      'Make one task block another: the blocked task cannot be completed until it is done.',
    permission: 'write',
    input: blockerInput,
  }),
  removeBlocker: defineAction({
    name: 'tasks.removeBlocker',
    description: 'Stop one task from blocking another.',
    permission: 'write',
    input: blockerInput,
  }),
  reopen: defineAction({
    name: 'tasks.reopen',
    description:
      'Undo the completion of a repeating task: restore the old values and remove the copies it created.',
    permission: 'write',
    input: reopenTaskInput,
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
