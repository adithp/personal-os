import { GOAL_STATUSES } from '@personal-os/shared';
import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';
import { entities } from './entities';

export const goalStatus = pgEnum('goal_status', GOAL_STATUSES);

/**
 * A goal (docs/DATABASE.md). Its id is the id of its row in entities (type `goal`), so tasks can
 * join it with a `belongs_to` link. Progress is computed from the linked tasks, never stored.
 */
export const goals = pgTable(
  'goals',
  {
    ...baseColumns(),
    title: text('title').notNull(),
    /** The notes of the goal. */
    description: text('description'),
    /** The start of the target day in India time (date only, like an all-day due date). */
    targetAt: timestamp('target_at', { withTimezone: true }),
    status: goalStatus('status').notNull().default('active'),
    /** When it was achieved or dropped; cleared when it becomes active again. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'goals_entity_fk',
      columns: [table.id, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    unique('goals_id_user_id_key').on(table.id, table.userId),
    index('goals_user_id_idx').on(table.userId),
    index('goals_user_status_idx').on(table.userId, table.status),
    ownRowsPolicy('goals', table.userId),
  ],
).enableRLS();

export type GoalRow = typeof goals.$inferSelect;
