import { EXPECTED_MIGRATIONS, type ExpectedMigration } from '@personal-os/db';
import { sql } from 'drizzle-orm';
import type { Db } from './user-scope';

/** What the app shows (and the API says) while the database is missing migrations. */
export const SCHEMA_BEHIND_MESSAGE = 'Database update needed: run pnpm db:migrate';

export interface SchemaStatus {
  /** True when the code has migrations the database has not applied. */
  behind: boolean;
  /** File names of the migrations the database is missing, oldest first. */
  missing: string[];
}

export interface SchemaGuard {
  check: () => Promise<SchemaStatus>;
}

/** Postgres error codes that mean "a table or column the code expects is not there". */
const SCHEMA_ERROR_CODES = new Set(['42P01', '42703', '3F000']);

function errorCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string') codes.push(code);
    current = current.cause;
  }
  return codes;
}

/** True when a database error looks like a missing table or column (an unapplied migration). */
export function isSchemaError(error: unknown): boolean {
  return errorCodes(error).some((code) => SCHEMA_ERROR_CODES.has(code));
}

/**
 * Read-only check of the database against the code's migrations (the journal in packages/db).
 * It only reads drizzle.__drizzle_migrations. It never applies a migration: the owner runs
 * `pnpm db:migrate`.
 */
export function createSchemaGuard(
  db: Db,
  expected: readonly ExpectedMigration[] = EXPECTED_MIGRATIONS,
): SchemaGuard {
  return {
    check: async () => {
      let applied = new Set<number>();
      try {
        const result: unknown = await db.execute(
          sql`select created_at from drizzle.__drizzle_migrations`,
        );
        const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
        applied = new Set(rows.map((row) => Number((row as { created_at: unknown }).created_at)));
      } catch (error) {
        // No migrations table at all means nothing was applied; anything else (a dead connection)
        // is not a schema problem, so it is passed on.
        if (!isSchemaError(error)) throw error;
      }
      const missing = expected.filter((m) => !applied.has(m.when)).map((m) => `${m.tag}.sql`);
      return { behind: missing.length > 0, missing };
    },
  };
}
