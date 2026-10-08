import type { FastifyInstance, FastifyRequest } from 'fastify';
import { unauthorized } from '../lib/http-error';
import type { AuthUser, JwtVerifier } from './verify-jwt';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user. Set on every route behind the login check, otherwise null. */
    user: AuthUser | null;
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

/** Reads "Authorization: Bearer <token>", or undefined when absent or not in that form. */
export function bearerToken(request: Pick<FastifyRequest, 'headers'>): string | undefined {
  const match = BEARER.exec(request.headers.authorization ?? '');
  return match?.[1];
}

/**
 * Makes every route registered in this scope (and inside it) need a valid Supabase token.
 * Missing, malformed, expired, or wrongly signed tokens all get the same 401.
 * Call it on the scope that holds the protected routes: a Fastify hook only applies to the
 * scope it is added to, which is why this is a function and not a nested plugin.
 */
export function requireLogin(app: FastifyInstance, verifier: JwtVerifier): void {
  app.addHook('onRequest', async (request, reply) => {
    const token = bearerToken(request);
    if (token) {
      try {
        request.user = await verifier.verify(token);
        return;
      } catch {
        // Falls through to the same 401 as a missing token.
      }
    }
    void reply.header('www-authenticate', 'Bearer');
    throw unauthorized();
  });
}
