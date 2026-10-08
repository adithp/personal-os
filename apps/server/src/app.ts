import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { Writable } from 'node:stream';
import { ZodError } from 'zod';
import { createRegistry } from './actions';
import { createJwtVerifier, type JwtVerifier } from './auth/verify-jwt';
import type { ServerEnv } from './config/env';
import { HttpError } from './lib/http-error';
import { isSchemaError, SCHEMA_BEHIND_MESSAGE, type SchemaGuard } from './lib/schema-guard';
import type { Db } from './lib/user-scope';
import { v1Routes } from './routes/v1';

export const API_PREFIX = '/api/v1';

export interface BuildAppOptions {
  env: ServerEnv;
  /** Checks login tokens. Defaults to the Supabase project's keys; tests pass their own. */
  verifier?: JwtVerifier;
  /** The database (always given when the server runs; some tests leave it out). */
  db?: Db;
  /** Tells a missing migration apart from a bug when a query fails (see lib/schema-guard.ts). */
  schemaGuard?: SchemaGuard;
  /** Where log lines go. Defaults to stdout. */
  logStream?: Writable;
}

interface ErrorBody {
  error: { code: string; message: string };
}

const body = (code: string, message: string): ErrorBody => ({ error: { code, message } });

/**
 * How an error is written to the log. A failed database query (drizzle's DrizzleQueryError) carries
 * the whole SQL text and its parameters (task titles, ids, filter values) in `message`, `query`,
 * and `params`; none of that is logged. The database's own message (the cause, such as
 * 'column "x" does not exist') and its code are kept, which is what diagnoses the problem.
 */
export interface ErrorLog {
  [key: string]: unknown;
  type: string;
  message: string;
  stack: string;
  code?: string;
}

export function serializeError(error: unknown): ErrorLog {
  if (!(error instanceof Error)) return { type: 'unknown', message: 'non-error thrown', stack: '' };
  const cause = error.cause instanceof Error ? error.cause : undefined;
  if (error.message.startsWith('Failed query:')) {
    const code = cause && (cause as Error & { code?: unknown }).code;
    return {
      type: error.name,
      message: `Database query failed: ${cause?.message ?? 'unknown database error'}`,
      // The outer stack repeats the query text, so only the database error's own stack is kept
      stack: cause?.stack ?? '',
      ...(typeof code === 'string' ? { code } : {}),
    };
  }
  return { type: error.name, message: error.message, stack: error.stack ?? '' };
}

/**
 * Builds the server. All routes live under /api/v1 (Caddy does not rewrite paths).
 * Logs never contain tokens: the Authorization and cookie headers are redacted and only the
 * path (no query string) of a request is logged.
 */
export function buildApp({
  env,
  verifier,
  db,
  schemaGuard,
  logStream,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      serializers: {
        err: serializeError,
        req: (request: { method: string; url: string; ip?: string }) => ({
          method: request.method,
          url: request.url.split('?')[0],
          remoteAddress: request.ip,
        }),
      },
      ...(logStream ? { stream: logStream } : {}),
    },
  });

  app.decorateRequest('user', null);

  void app.register(cors, {
    origin: env.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });

  void app.register(v1Routes, {
    prefix: API_PREFIX,
    verifier: verifier ?? createJwtVerifier({ supabaseUrl: env.SUPABASE_URL }),
    ...(db ? { db, registry: createRegistry() } : {}),
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(body('not_found', 'Route not found'));
  });

  app.setErrorHandler(async (error: FastifyError | Error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(body(error.code, error.message));
    }
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send(body('validation_error', error.issues.map((issue) => issue.message).join('; ')));
    }
    if (schemaGuard && isSchemaError(error)) {
      // A query failed on a missing table or column: say so plainly if migrations are pending
      try {
        const schema = await schemaGuard.check();
        if (schema.behind) {
          request.log.error({ missing: schema.missing }, 'the database schema is behind');
          return await reply.status(503).send(body('schema_behind', SCHEMA_BEHIND_MESSAGE));
        }
      } catch {
        // Could not check: fall through to the generic error
      }
    }
    const status =
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 400 && status < 500) {
      // Framework errors such as a malformed JSON body or a too-large payload.
      return reply.status(status).send(body('bad_request', 'The request could not be processed'));
    }
    request.log.error({ err: error }, 'request failed');
    return reply.status(500).send(body('internal_error', 'Something went wrong on the server'));
  });

  return app;
}
