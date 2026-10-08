import { TASK_STATUSES } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';
import { entities } from './entities';

export const taskStatus = pgEnum('task_status', TASK_STATUSES);

/**
 * A task (docs/DATABASE.md section 3). Its id is the id of its row in entities, so a task can be
 * linked, searched, and tagged like every other item. Project and category come in Step 5.
 */
export const tasks = pgTable(
  'tasks',
  {
    ...baseColumns(),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatus('status').notNull().default('todo'),
    /** 1 is the most urgent, 4 the least. */
    priority: smallint('priority').notNull().default(4),
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** Only saved for now; notifications arrive with the reminder job. */
    reminderAt: timestamp('reminder_at', { withTimezone: true }),
    /** RRULE text, e.g. FREQ=WEEKLY;BYDAY=MO. */
    recurrenceRule: text('recurrence_rule'),
    parentTaskId: uuid('parent_task_id'),
    /** Order inside a list or kanban column. Moving a task sets a number between its neighbours. */
    position: doublePrecision('position').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...deletedAtColumn(),
  },
  (table) => [
    // The task is the entity with the same id and the same owner.
    foreignKey({
      name: 'tasks_entity_fk',
      columns: [table.id, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    // Subtasks point at a task of the same owner.
    unique('tasks_id_user_id_key').on(table.id, table.userId),
    foreignKey({
      name: 'tasks_parent_fk',
      columns: [table.parentTaskId, table.userId],
      foreignColumns: [table.id, table.userId],
    }).onDelete('cascade'),
    check('tasks_priority_range', sql`${table.priority} between 1 and 4`),
    check('tasks_not_own_parent', sql`${table.parentTaskId} <> ${table.id}`),
    index('tasks_user_id_idx').on(table.userId),
    index('tasks_user_status_idx').on(table.userId, table.status),
    index('tasks_parent_idx').on(table.parentTaskId),
    index('tasks_due_at_idx').on(table.userId, table.dueAt),
    ownRowsPolicy('tasks', table.userId),
  ],
).enableRLS();

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
