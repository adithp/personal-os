import { PROJECT_STATUSES } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';
import { entities } from './entities';
import { tasks } from './tasks';

export const projectStatus = pgEnum('project_status', PROJECT_STATUSES);

/**
 * A client (docs/DATABASE.md, Projects). Its id is the id of its row in entities (type `client`).
 */
export const clients = pgTable(
  'clients',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    company: text('company'),
    notes: text('notes'),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'clients_entity_fk',
      columns: [table.id, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    unique('clients_id_user_id_key').on(table.id, table.userId),
    index('clients_user_id_idx').on(table.userId),
    ownRowsPolicy('clients', table.userId),
  ],
).enableRLS();

/**
 * A project. Its id is the id of its row in entities (type `project`); tasks and notes join it
 * through a live `belongs_to` link (source = task or note, target = project). Progress is computed.
 */
export const projects = pgTable(
  'projects',
  {
    ...baseColumns(),
    title: text('title').notNull(),
    description: text('description'),
    status: projectStatus('status').notNull().default('active'),
    clientId: uuid('client_id'),
    /** Start of the day in India time (date only). */
    startAt: timestamp('start_at', { withTimezone: true }),
    /** Start of the due day in India time (date only). */
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** A hex color like #7C9CF5, or null for the module color. */
    color: text('color'),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'projects_entity_fk',
      columns: [table.id, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    unique('projects_id_user_id_key').on(table.id, table.userId),
    foreignKey({
      name: 'projects_client_fk',
      columns: [table.clientId, table.userId],
      foreignColumns: [clients.id, clients.userId],
    }),
    index('projects_user_id_idx').on(table.userId),
    index('projects_user_status_idx').on(table.userId, table.status),
    index('projects_client_idx').on(table.clientId),
    ownRowsPolicy('projects', table.userId),
  ],
).enableRLS();

/** A milestone of a project: a title, an optional due day, done or not. A plain table. */
export const projectMilestones = pgTable(
  'project_milestones',
  {
    ...baseColumns(),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    /** Start of the due day in India time. */
    dueAt: timestamp('due_at', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    position: doublePrecision('position').notNull().default(0),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'project_milestones_project_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [projects.id, projects.userId],
    }).onDelete('cascade'),
    index('project_milestones_user_id_idx').on(table.userId),
    index('project_milestones_project_idx').on(table.projectId),
    ownRowsPolicy('project_milestones', table.userId),
  ],
).enableRLS();

/**
 * A time entry: work on a project (and maybe one of its tasks). endedAt null means the timer is
 * running; at most one running entry per user (partial unique index). Times are UTC.
 */
export const timeEntries = pgTable(
  'time_entries',
  {
    ...baseColumns(),
    projectId: uuid('project_id').notNull(),
    taskId: uuid('task_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    note: text('note'),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'time_entries_project_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [projects.id, projects.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'time_entries_task_fk',
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }),
    check(
      'time_entries_end_after_start',
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
    uniqueIndex('time_entries_one_running_idx')
      .on(table.userId)
      .where(sql`${table.endedAt} is null and ${table.deletedAt} is null`),
    index('time_entries_user_id_idx').on(table.userId),
    index('time_entries_project_idx').on(table.projectId, table.startedAt),
    ownRowsPolicy('time_entries', table.userId),
  ],
).enableRLS();

export type ClientRow = typeof clients.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type MilestoneRow = typeof projectMilestones.$inferSelect;
export type TimeEntryRow = typeof timeEntries.$inferSelect;
