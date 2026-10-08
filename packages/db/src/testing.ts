import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

/**
 * A throw-away in-memory Postgres for tests (PGlite). It gets a stand-in for the Supabase parts
 * the schema needs (auth.users, auth.uid(), the anon and authenticated roles), then the real
 * generated migrations are applied, so tests run against the same SQL you will run on Supabase.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle/', import.meta.url));

const SUPABASE_STAND_IN = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant select on auth.users to authenticated;
`;

/** Migration file names in the order they run. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

/** The SQL of one migration, split into statements the way drizzle-kit does. */
export function migrationStatements(file: string): string[] {
  return readFileSync(`${MIGRATIONS_DIR}${file}`, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export type TestDatabase = PgliteDatabase<typeof schema>;

export interface TestDb {
  pg: PGlite;
  db: TestDatabase;
  close: () => Promise<void>;
}

/** Starts an in-memory database with all migrations applied and the app role privileges granted. */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STAND_IN);
  for (const file of migrationFiles()) {
    for (const statement of migrationStatements(file)) await pg.exec(statement);
  }
  // Supabase gives these roles table access by default; RLS then decides which rows they see.
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  return { pg, db: drizzle(pg, { schema }), close: () => pg.close() };
}

/** Adds a user to the stand-in auth.users table, like signing up in Supabase. */
export async function createTestUser(db: TestDatabase, id: string): Promise<void> {
  await db.execute(sql`insert into auth.users (id) values (${id})`);
}

/**
 * Runs `work` the way Supabase runs a request that carries a user's token: as the
 * "authenticated" role with auth.uid() set to that user, so Row Level Security applies.
 * Pass userId = null for the "anon" role (no login).
 */
export async function asRole<T>(
  db: TestDatabase,
  userId: string | null,
  work: (tx: Parameters<Parameters<TestDatabase['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(userId === null ? 'set local role anon' : 'set local role authenticated'),
    );
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId ?? ''}, true)`);
    return work(tx);
  });
}
