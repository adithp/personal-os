import { buildApp } from './app';
import { EnvError, loadEnv } from './config/env';
import { connectDatabase } from './lib/database';

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
const app = buildApp({ env, db: database.db });

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
