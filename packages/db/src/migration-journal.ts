import journal from '../drizzle/meta/_journal.json';

/** A migration the code expects to be applied: its file name (without .sql) and drizzle's time stamp. */
export interface ExpectedMigration {
  tag: string;
  /** Stored by drizzle in drizzle.__drizzle_migrations.created_at when the migration is applied. */
  when: number;
}

/**
 * Every migration in packages/db/drizzle, in order (read from drizzle's journal at build time, so
 * the server bundle carries it). The server compares it with what is applied in the database.
 */
export const EXPECTED_MIGRATIONS: readonly ExpectedMigration[] = journal.entries.map(
  ({ tag, when }) => ({ tag, when }),
);
