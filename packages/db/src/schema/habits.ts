import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { HabitSchedule } from '@personal-os/shared';
import { baseColumns, ownRowsPolicy } from './columns';

/**
 * A habit (docs/design/research/habits.md). A plain table, not an entity. `schedule` is
 * `{type:'daily'} | {type:'weekly', days:[1..7 ISO]} | {type:'custom', everyDays:n}`; `target` is
 * the count that makes a scheduled day done. `startDate` is the India day the habit begins.
 * Archive keeps the history (`archivedAt`).
 */
export const habits = pgTable(
  'habits',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    category: text('category'),
    schedule: jsonb('schedule').$type<HabitSchedule>().notNull(),
    target: integer('target').notNull().default(1),
    /** HH:MM, stored only (no notifications yet). */
    reminderTime: text('reminder_time'),
    /** A hex color replacing the module color. */
    color: text('color'),
    notes: text('notes').notNull().default(''),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    unique('habits_id_user_id_key').on(table.id, table.userId),
    check('habits_target_check', sql`${table.target} >= 1`),
    index('habits_user_id_idx').on(table.userId),
    ownRowsPolicy('habits', table.userId),
  ],
).enableRLS();

/** One check-in: a habit's count for one India calendar day. At most one row per habit per day. */
export const habitLogs = pgTable(
  'habit_logs',
  {
    ...baseColumns(),
    habitId: uuid('habit_id').notNull(),
    logDate: date('log_date', { mode: 'string' }).notNull(),
    count: integer('count').notNull().default(1),
  },
  (table) => [
    foreignKey({
      name: 'habit_logs_habit_fk',
      columns: [table.habitId, table.userId],
      foreignColumns: [habits.id, habits.userId],
    }).onDelete('cascade'),
    unique('habit_logs_habit_date_key').on(table.habitId, table.logDate),
    check('habit_logs_count_check', sql`${table.count} >= 1`),
    index('habit_logs_user_id_idx').on(table.userId),
    index('habit_logs_habit_date_idx').on(table.habitId, table.logDate),
    ownRowsPolicy('habit_logs', table.userId),
  ],
).enableRLS();

export type HabitRow = typeof habits.$inferSelect;
export type HabitLogRow = typeof habitLogs.$inferSelect;
