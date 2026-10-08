import { createDatabase } from '@personal-os/db';
import type { Db } from './user-scope';

export interface ServerDatabase {
  db: Db;
  close: () => Promise<void>;
}

/**
 * Opens the connection to Supabase Postgres (session pooler). This is the only place the server
 * opens a connection; everything else gets the Db and reaches user data through the user-scope helper.
 */
export function connectDatabase(databaseUrl: string): ServerDatabase {
  const connection = createDatabase(databaseUrl);
  return { db: connection.db, close: connection.close };
}
