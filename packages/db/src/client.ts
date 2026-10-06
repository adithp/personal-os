import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  /** Closes the connection pool. */
  close: () => Promise<void>;
}

/**
 * Connects with DATABASE_URL (the Supabase session pooler, IPv4). The server connects as the
 * postgres role, which skips Row Level Security, so every query on user data must go through
 * the user-scope helper in apps/server/src/lib/user-scope.ts.
 */
export function createDatabase(databaseUrl: string): DatabaseConnection {
  const client = postgres(databaseUrl, { max: 5, idle_timeout: 20, connect_timeout: 10 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
