import { buildApp } from './app';
import { EnvError, loadEnv } from './config/env';
import { connectDatabase } from './lib/database';
import { createSchemaGuard, SCHEMA_BEHIND_MESSAGE } from './lib/schema-guard';

function readEnv() {
  try {
    return loadEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      console.error(
        'Copy the server values from .env.example into apps/server/.env and fill them in.',
      );
      process.exit(1);
    }
    throw error;
  }
}

const env = readEnv();
const database = connectDatabase(env.DATABASE_URL);
const schemaGuard = createSchemaGuard(database.db);
const app = buildApp({ env, db: database.db, schemaGuard });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await database.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error({ err: error }, 'could not start');
  process.exit(1);
}

// Read-only check: warn clearly when the database is missing migrations (never applies them)
void schemaGuard
  .check()
  .then((schema) => {
    if (schema.behind) {
      app.log.warn(
        { missing: schema.missing },
        `${SCHEMA_BEHIND_MESSAGE}. Missing: ${schema.missing.join(', ')}`,
      );
    }
  })
  .catch(() => {
    app.log.warn('Could not check which database migrations are applied');
  });
