import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { pgPolicy, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authenticatedRole, authUsers } from 'drizzle-orm/supabase';

/** Columns every table has: id, owner, and created/updated times (docs/DATABASE.md rules). */
export const baseColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Soft delete for user content tables. Times are stored in UTC. */
export const deletedAtColumn = () => ({
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * Row Level Security for a table: a signed-in user can only see and write rows whose user_id is
 * their own. The check is user_id = auth.uid(), wrapped in a sub-select so Postgres evaluates it once.
 * The backend connects as postgres (which skips RLS) and filters by user_id itself; RLS protects
 * everything that reaches the database with the user's own token (the apps and Realtime).
 */
export const ownRowsPolicy = (table: string, userId: AnyPgColumn) =>
  pgPolicy(`${table}_own_rows`, {
    as: 'permissive',
    for: 'all',
    to: authenticatedRole,
    using: sql`${userId} = (select auth.uid())`,
    withCheck: sql`${userId} = (select auth.uid())`,
  });
