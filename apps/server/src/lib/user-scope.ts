import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgDatabase, PgQueryResultHKT, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/**
 * THE way the backend reads and writes user data.
 *
 * The server connects to Postgres as the postgres role, which skips Row Level Security, so RLS
 * cannot protect these queries. Instead every query goes through a UserScope, which adds
 * "user_id = <the signed-in user>" itself:
 *  - reads, updates, and deletes only ever touch the user's own rows, however the extra
 *    condition is written (it is always combined with AND);
 *  - new rows always get the user's id, whatever the input says;
 *  - an update cannot hand a row to another user.
 * Never query a user table any other way.
 */

/** Any Postgres database from drizzle (postgres-js on Supabase, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** A table whose rows belong to a user. */
export type UserOwnedTable = PgTable & { id: AnyPgColumn; userId: AnyPgColumn };

/** A user-owned table that supports soft delete (deleted_at). */
export type SoftDeletableTable = UserOwnedTable & { deletedAt: AnyPgColumn };

/** The columns an update may never change: the owner and the row's identity. */
type Protected = 'id' | 'userId';

/** What selectFields returns per row: columns, or SQL values with an alias. */
export type SelectedFields = Record<string, AnyPgColumn | SQL | SQL.Aliased>;

export interface SelectOptions {
  /** Extra condition. It can only narrow the user's rows, never widen them. */
  where?: SQL;
  orderBy?: SQL | AnyPgColumn | (SQL | AnyPgColumn)[];
  limit?: number;
  offset?: number;
}

export interface UserScope {
  readonly userId: string;
  /** user_id = this user AND the extra condition. Use it to build conditions yourself. */
  where: (table: UserOwnedTable, condition?: SQL) => SQL;
  /** Condition for rows that are not soft-deleted. */
  isLive: (table: SoftDeletableTable) => SQL;
  /** The user's rows. */
  select: <T extends UserOwnedTable>(
    table: T,
    options?: SelectOptions,
  ) => Promise<T['$inferSelect'][]>;
  /** Chosen columns or computed SQL values (for example a search rank) of the user's rows. */
  selectFields: <F extends SelectedFields>(
    table: UserOwnedTable,
    fields: F,
    options?: SelectOptions,
  ) => Promise<Record<keyof F, unknown>[]>;
  /** Creates rows for this user (a userId in the input is ignored) and returns them. */
  insert: <T extends UserOwnedTable>(
    table: T,
    rows: Omit<T['$inferInsert'], 'userId'> | Omit<T['$inferInsert'], 'userId'>[],
  ) => Promise<T['$inferSelect'][]>;
  /** Changes the user's rows that match, and returns them. userId and id in `values` are ignored. */
  update: <T extends UserOwnedTable>(
    table: T,
    values: Partial<Omit<T['$inferInsert'], Protected>>,
    where: SQL,
  ) => Promise<T['$inferSelect'][]>;
  /** Deletes the user's rows that match, and returns them. The condition is required. */
  delete: <T extends UserOwnedTable>(table: T, where: SQL) => Promise<T['$inferSelect'][]>;
  /** Marks the user's matching rows deleted (deleted_at = now) and returns them. */
  softDelete: <T extends SoftDeletableTable>(table: T, where: SQL) => Promise<T['$inferSelect'][]>;
  /** Runs several queries in one transaction. They share this scope and roll back together. */
  transaction: <R>(work: (scope: UserScope) => Promise<R>) => Promise<R>;
}

const userIdSchema = z.uuid();

/** Creates the scope for one verified user. `userId` must be the id from the checked token. */
export function createUserScope(db: Db, userId: string): UserScope {
  const id = userIdSchema.parse(userId);

  const where: UserScope['where'] = (table, condition) => {
    // The owner comes first and the extra condition is ANDed: it can narrow but never widen.
    const scoped = and(eq(table.userId, id), condition);
    if (!scoped) throw new Error('Could not build the user condition');
    return scoped;
  };

  // drizzle's generic table types do not resolve inside a generic helper, so the queries are run
  // on the plain PgTable type and the rows are given back with the caller's table type.
  const plain = (table: UserOwnedTable): PgTable => table;

  return {
    userId: id,
    where,
    isLive: (table) => isNull(table.deletedAt),

    select: async (table, options = {}) => {
      let query = db.select().from(plain(table)).where(where(table, options.where)).$dynamic();
      if (options.orderBy !== undefined) {
        query = query.orderBy(
          ...(Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy]),
        );
      }
      if (options.limit !== undefined) query = query.limit(options.limit);
      if (options.offset !== undefined) query = query.offset(options.offset);
      return await query;
    },

    selectFields: async (table, fields, options = {}) => {
      let query = db
        .select(fields)
        .from(plain(table))
        .where(where(table, options.where))
        .$dynamic();
      if (options.orderBy !== undefined) {
        query = query.orderBy(
          ...(Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy]),
        );
      }
      if (options.limit !== undefined) query = query.limit(options.limit);
      if (options.offset !== undefined) query = query.offset(options.offset);
      return (await query) as Record<keyof typeof fields, unknown>[];
    },

    insert: async (table, rows) => {
      const list = Array.isArray(rows) ? rows : [rows];
      if (list.length === 0) return [];
      // userId comes last so it replaces anything in the input.
      const values = list.map((row) => ({ ...row, userId: id }));
      return await db.insert(plain(table)).values(values).returning();
    },

    update: async (table, values, condition) => {
      // Removed at runtime as well as in the type, in case a caller passes them anyway.
      const { id: _id, userId: _userId, ...safe } = values as Record<string, unknown>;
      return await db.update(plain(table)).set(safe).where(where(table, condition)).returning();
    },

    delete: async (table, condition) =>
      await db.delete(plain(table)).where(where(table, condition)).returning(),

    softDelete: async (table, condition) =>
      await db
        .update(plain(table))
        .set({ deletedAt: new Date() })
        .where(where(table, condition))
        .returning(),

    transaction: (work) => db.transaction((tx) => work(createUserScope(tx as unknown as Db, id))),
  };
}
