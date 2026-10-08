import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { HttpError } from './lib/http-error';
import { TEST_SUPABASE_URL, USER_ID, createTestKeys, type TestKeys } from './test/jwt';

let keys: TestKeys;
let app: FastifyInstance | undefined;

const env = loadEnv({ SUPABASE_URL: TEST_SUPABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'silent' });

beforeAll(async () => {
  keys = await createTestKeys();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function makeApp(options: Parameters<typeof buildApp>[0] = { env }) {
  app = buildApp({ verifier: keys.verifier, ...options });
  return app;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('GET /api/v1/health', () => {
  it('answers 200 with no login', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    const json = response.json<{ status: string; time: string }>();
    expect(json.status).toBe('ok');
    expect(new Date(json.time).toISOString()).toBe(json.time); // UTC ISO time
  });

  it('does not care about a bad Authorization header', async () => {
    const response = await makeApp().inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { authorization: 'Bearer total-garbage' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('only exists under /api/v1', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'not_found', message: 'Route not found' },
    });
  });

  it('exposes nothing about the server or its settings', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/api/v1/health' });
    expect(Object.keys(response.json<object>()).sort()).toEqual(['status', 'time']);
    expect(response.body).not.toContain('supabase');
  });
});

describe('GET /api/v1/me (needs login)', () => {
  it('returns the signed-in user for a valid token', async () => {
    const response = await makeApp().inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: bearer(await keys.sign({ email: 'me@example.com' })),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: USER_ID,
      email: 'me@example.com',
      role: 'authenticated',
    });
  });

  it('accepts "bearer" in any letter case', async () => {
    const response = await makeApp().inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `bearer ${await keys.sign()}` },
    });
    expect(response.statusCode).toBe(200);
  });

  const bad: [string, () => Promise<Record<string, string>>][] = [
    ['no Authorization header', () => Promise.resolve({})],
    ['an empty Authorization header', () => Promise.resolve({ authorization: '' })],
    ['a header without Bearer', async () => ({ authorization: await keys.sign() })],
    ['Basic auth', () => Promise.resolve({ authorization: 'Basic dXNlcjpwYXNz' })],
    ['Bearer with no token', () => Promise.resolve({ authorization: 'Bearer ' })],
    ['a malformed token', () => Promise.resolve(bearer('not.a.jwt'))],
    ['an expired token', async () => bearer(await keys.sign({ expiresIn: -30 }))],
    [
      'the wrong issuer',
      async () => bearer(await keys.sign({ issuer: 'https://evil.example/auth/v1' })),
    ],
    ['the wrong audience', async () => bearer(await keys.sign({ audience: 'something-else' }))],
    ['an unknown signing key', async () => bearer(await keys.signWithUnknownKey())],
  ];

  it.each(bad)('rejects %s with 401 in the standard error format', async (_name, headers) => {
    const response = await makeApp().inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: await headers(),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'unauthorized', message: expect.any(String) as string },
    });
    expect(response.headers['www-authenticate']).toBeDefined();
  });

  it('never says why a token was refused', async () => {
    const messages = new Set<string>();
    for (const [, headers] of bad) {
      const response = await makeApp().inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: await headers(),
      });
      messages.add(response.json<{ error: { message: string } }>().error.message);
      await app?.close();
      app = undefined;
    }
    expect(messages.size).toBe(1);
  });

  it('is not reachable without the /api/v1 prefix', async () => {
    const response = await makeApp().inject({
      method: 'GET',
      url: '/me',
      headers: bearer(await keys.sign()),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('error format', () => {
  it('turns an unknown route into a JSON 404', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/api/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });

  it('turns a thrown HttpError into its status and code', async () => {
    const server = makeApp();
    server.get('/api/v1/teapot', () => {
      throw new HttpError(418, 'teapot', 'I am a teapot');
    });
    const response = await server.inject({ method: 'GET', url: '/api/v1/teapot' });
    expect(response.statusCode).toBe(418);
    expect(response.json()).toEqual({ error: { code: 'teapot', message: 'I am a teapot' } });
  });

  it('turns a validation failure into a 400', async () => {
    const server = makeApp();
    server.get('/api/v1/validate', () => z.object({ n: z.number() }).parse({ n: 'x' }));
    const response = await server.inject({ method: 'GET', url: '/api/v1/validate' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('validation_error');
  });

  it('hides the details of an unexpected crash', async () => {
    const server = makeApp();
    server.get('/api/v1/boom', () => {
      throw new Error('database password is hunter2');
    });
    const response = await server.inject({ method: 'GET', url: '/api/v1/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong on the server' },
    });
    expect(response.body).not.toContain('hunter2');
  });

  it('answers a malformed JSON body with a clean 400', async () => {
    const server = makeApp();
    server.post('/api/v1/echo', (request) => request.body);
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('bad_request');
  });
});

describe('CORS (the desktop app talks to the server from the browser engine)', () => {
  it.each(['http://tauri.localhost', 'http://127.0.0.1:1420', 'http://localhost:1420'])(
    'allows the app origin %s',
    async (origin) => {
      const response = await makeApp().inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { origin },
      });
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    },
  );

  it('answers the preflight for an authorized request from the app', async () => {
    const response = await makeApp().inject({
      method: 'OPTIONS',
      url: '/api/v1/me',
      headers: {
        origin: 'http://tauri.localhost',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://tauri.localhost');
    expect(response.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('does not allow other websites', async () => {
    const response = await makeApp().inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('uses the origins from the settings when given', async () => {
    const custom = loadEnv({
      SUPABASE_URL: TEST_SUPABASE_URL,
      LOG_LEVEL: 'silent',
      CORS_ORIGINS: 'https://app.example',
    });
    const response = await makeApp({ env: custom }).inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://tauri.localhost' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('logging never contains secrets', () => {
  async function captureLogs(run: (server: FastifyInstance) => Promise<void>): Promise<string> {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const server = makeApp({
      env: loadEnv({ SUPABASE_URL: TEST_SUPABASE_URL, LOG_LEVEL: 'trace' }),
      logStream: stream,
    });
    await run(server);
    await server.close();
    app = undefined;
    return lines.join('');
  }

  it('does not log the token, the cookie, or the query string', async () => {
    const token = await keys.sign();
    const logs = await captureLogs(async (server) => {
      await server.inject({
        method: 'GET',
        url: '/api/v1/me?code=OAUTH-CODE-12345&state=SECRET-STATE',
        headers: { ...bearer(token), cookie: 'session=COOKIE-VALUE-9' },
      });
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(token.split('.')[1] ?? 'x');
    expect(logs).not.toContain('OAUTH-CODE-12345');
    expect(logs).not.toContain('SECRET-STATE');
    expect(logs).not.toContain('COOKIE-VALUE-9');
    expect(logs).toContain('/api/v1/me'); // the path is still logged
  });

  it('does not log a refused token either', async () => {
    const logs = await captureLogs(async (server) => {
      await server.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: bearer('not.a.REAL-LOOKING-TOKEN'),
      });
    });
    expect(logs).not.toContain('REAL-LOOKING-TOKEN');
  });

  it('does not log the message of an unexpected crash to the client, only to the server log', async () => {
    const logs = await captureLogs(async (server) => {
      server.get('/api/v1/boom', () => {
        throw new Error('internal detail');
      });
      const response = await server.inject({ method: 'GET', url: '/api/v1/boom' });
      expect(response.body).not.toContain('internal detail');
    });
    expect(logs).toContain('request failed');
  });
});
