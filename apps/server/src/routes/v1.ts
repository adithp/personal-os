import type { FastifyPluginAsync } from 'fastify';
import { requireLogin } from '../auth/plugin';
import type { JwtVerifier } from '../auth/verify-jwt';
import type { ActionRegistry } from '../actions';
import { unauthorized } from '../lib/http-error';
import type { Db } from '../lib/user-scope';
import { tagRoutes } from './tags';
import { taskRoutes } from './tasks';
import { undoRoutes } from './undo';

export interface V1Options {
  verifier: JwtVerifier;
  /** The database. Without it only /health and /me exist (some tests run that way). */
  db?: Db;
  registry?: ActionRegistry;
}

/** Everything under /api/v1. Only /health is open; the rest needs a signed-in user. */
export const v1Routes: FastifyPluginAsync<V1Options> = async (app, { verifier, db, registry }) => {
  // Open: used by Docker, Caddy, and uptime checks.
  app.get('/health', () => ({ status: 'ok', time: new Date().toISOString() }));

  // Everything registered below needs a valid token.
  await app.register((protectedApp) => {
    requireLogin(protectedApp, verifier);

    // Who the server thinks you are. Handy to check that login works end to end.
    protectedApp.get('/me', (request) => {
      if (!request.user) throw unauthorized();
      return { id: request.user.id, email: request.user.email, role: request.user.role };
    });

    if (db && registry) {
      taskRoutes(protectedApp, { db, registry });
      tagRoutes(protectedApp, { db, registry });
      undoRoutes(protectedApp, { db, registry });
    }

    return Promise.resolve();
  });
};
