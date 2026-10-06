import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { Writable } from 'node:stream';
import { ZodError } from 'zod';
import { createJwtVerifier, type JwtVerifier } from './auth/verify-jwt';
import type { ServerEnv } from './config/env';
import { HttpError } from './lib/http-error';
import { v1Routes } from './routes/v1';

export const API_PREFIX = '/api/v1';

export interface BuildAppOptions {
  env: ServerEnv;
  /** Checks login tokens. Defaults to the Supabase project's keys; tests pass their own. */
  verifier?: JwtVerifier;
  /** Where log lines go. Defaults to stdout. */
  logStream?: Writable;
}

interface ErrorBody {
  error: { code: string; message: string };
}

const body = (code: string, message: string): ErrorBody => ({ error: { code, message } });

/**
 * Builds the server. All routes live under /api/v1 (Caddy does not rewrite paths).
 * Logs never contain tokens: the Authorization and cookie headers are redacted and only the
 * path (no query string) of a request is logged.
 */
export function buildApp({ env, verifier, logStream }: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      serializers: {
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
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(body('not_found', 'Route not found'));
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(body(error.code, error.message));
    }
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send(body('validation_error', error.issues.map((issue) => issue.message).join('; ')));
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
