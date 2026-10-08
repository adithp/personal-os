import { describe, expect, it, vi } from 'vitest';
import { signedInAuth, signedOutAuth } from '../test/fake-auth';
import { ApiError, createApiClient, createApiFromEnv } from './api-client';

const BASE = 'http://127.0.0.1:3000/api/v1';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client(fetchImpl: typeof fetch, token: string | null = 'abc') {
  return createApiClient({ baseUrl: BASE, getToken: () => Promise.resolve(token), fetchImpl });
}

describe('createApiClient', () => {
  it('sends the login token and returns the JSON', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ items: [] })));
    const result = await client(fetchImpl as unknown as typeof fetch).request('GET', '/tasks');
    expect(result).toEqual({ items: [] });
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/tasks`, {
      method: 'GET',
      headers: { Authorization: 'Bearer abc' },
      body: undefined,
    });
  });

  it('sends a JSON body with its content type', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ ok: true }, 201)));
    await client(fetchImpl as unknown as typeof fetch).request('POST', '/tasks', {
      body: { title: 'x' },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/tasks`,
      expect.objectContaining({
        body: '{"title":"x"}',
        headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      }),
    );
  });

  it('builds the query string, repeating list values and skipping missing ones', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({})));
    await client(fetchImpl as unknown as typeof fetch).request('GET', '/tasks', {
      query: { status: ['todo', 'doing'], limit: 10, archived: false, sort: undefined },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/tasks?status=todo&status=doing&limit=10&archived=false`,
      expect.anything(),
    );
  });

  it('copes with a trailing slash on the base address', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({})));
    await createApiClient({
      baseUrl: `${BASE}/`,
      getToken: () => Promise.resolve('abc'),
      fetchImpl: fetchImpl,
    }).request('GET', '/me');
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/me`, expect.anything());
  });

  it('throws the server’s error code and message', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ error: { code: 'not_found', message: 'Task not found' } }, 404),
      ),
    );
    const error = await client(fetchImpl as unknown as typeof fetch)
      .request('GET', '/tasks/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'not_found', message: 'Task not found' });
  });

  it('gives a generic error when the answer is not the usual error format', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('<html>oops</html>', { status: 502 })),
    );
    const error = await client(fetchImpl as unknown as typeof fetch)
      .request('GET', '/tasks')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 502,
      code: 'http_error',
      message: 'The server answered 502.',
    });
  });

  it('says the server cannot be reached when the network fails, without details', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('fetch failed: ECONNREFUSED')));
    const error = await client(fetchImpl as unknown as typeof fetch)
      .request('GET', '/tasks')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: 'network' });
    expect((error as ApiError).message).not.toContain('ECONNREFUSED');
  });

  it('does not call the server when there is no login token', async () => {
    const fetchImpl = vi.fn();
    const error = await client(fetchImpl as unknown as typeof fetch, null)
      .request('GET', '/tasks')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createApiFromEnv', () => {
  const env = {
    VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'public-anon-key-value',
    VITE_API_URL: BASE,
  };

  it('asks the auth for the current token', async () => {
    const { auth } = signedInAuth();
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal('fetch', fetchImpl);
    await createApiFromEnv(env, auth).request('GET', '/me');
    vi.unstubAllGlobals();
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/me`,
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('fails clearly when the app is not configured', async () => {
    const { auth } = signedOutAuth();
    const error = await createApiFromEnv({}, auth)
      .request('GET', '/me')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'not_configured' });
  });
});

describe('auth.getAccessToken', () => {
  it('returns the session token, or null when signed out', async () => {
    expect(await signedInAuth().auth.getAccessToken()).toBe('test-token');
    expect(await signedOutAuth().auth.getAccessToken()).toBeNull();
  });
});
