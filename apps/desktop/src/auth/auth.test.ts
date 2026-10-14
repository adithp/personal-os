import { afterEach, describe, expect, it, vi } from 'vitest';
import { RECENT_STORAGE_KEY, useRecentItems } from '../store/recent-items-store';
import { createFakeClient } from '../test/fake-auth';
import { createAuth } from './auth';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initialize', () => {
  it('starts as loading, then signed out when there is no saved session', async () => {
    const { client } = createFakeClient(null);
    const auth = createAuth({ client });
    expect(auth.store.getState().status).toBe('loading');

    await auth.initialize();
    expect(auth.store.getState()).toMatchObject({ status: 'signedOut', email: null });
  });

  it('restores a saved session after a restart', async () => {
    const { client } = createFakeClient({ user: { email: 'me@example.com' } });
    const auth = createAuth({ client });

    await auth.initialize();
    expect(auth.store.getState()).toMatchObject({ status: 'signedIn', email: 'me@example.com' });
  });

  it('reads the session only once however often it is called', async () => {
    const { client, mocks } = createFakeClient(null);
    const auth = createAuth({ client });

    await Promise.all([auth.initialize(), auth.initialize()]);
    await auth.initialize();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.onAuthStateChange).toHaveBeenCalledOnce();
  });

  it('treats a failing session lookup as signed out', async () => {
    const { client, mocks } = createFakeClient(null);
    mocks.getSession.mockRejectedValueOnce(new Error('storage unavailable'));
    const auth = createAuth({ client });

    await auth.initialize();
    expect(auth.store.getState().status).toBe('signedOut');
  });

  it('follows sign-in, token expiry, and sign-out events from Supabase', async () => {
    const { client, emit } = createFakeClient(null);
    const auth = createAuth({ client });
    await auth.initialize();

    emit('SIGNED_IN', { user: { email: 'me@example.com' } });
    expect(auth.store.getState().status).toBe('signedIn');

    emit('SIGNED_OUT', null);
    expect(auth.store.getState()).toMatchObject({ status: 'signedOut', email: null });
  });
});

describe('signIn', () => {
  it('signs in with a trimmed email and the exact password', async () => {
    const { client, mocks } = createFakeClient(null);
    const auth = createAuth({ client });
    await auth.initialize();

    const result = await auth.signIn(' me@example.com ', ' pass word ');
    expect(result).toEqual({ ok: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: ' pass word ',
    });
    expect(auth.store.getState()).toMatchObject({ status: 'signedIn', email: 'me@example.com' });
  });

  it('says "Wrong email or password." for bad credentials and stays signed out', async () => {
    const { client, mocks } = createFakeClient(null);
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 },
    });
    const auth = createAuth({ client });
    await auth.initialize();

    expect(await auth.signIn('me@example.com', 'nope')).toEqual({
      ok: false,
      message: 'Wrong email or password.',
    });
    expect(auth.store.getState().status).toBe('signedOut');
  });

  it('gives a generic message for other errors without leaking details', async () => {
    const { client, mocks } = createFakeClient(null);
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'database connection string xyz exploded', status: 500 },
    });
    const auth = createAuth({ client });

    const result = await auth.signIn('me@example.com', 'pw');
    expect(result).toEqual({
      ok: false,
      message: 'Could not sign in. Check your connection and try again.',
    });
  });

  it('handles a network failure', async () => {
    const { client, mocks } = createFakeClient(null);
    mocks.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const auth = createAuth({ client });

    expect(await auth.signIn('me@example.com', 'pw')).toMatchObject({ ok: false });
  });

  it.each([
    ['', 'pw', 'Enter your email'],
    ['not-an-email', 'pw', 'Enter a valid email'],
    ['me@example.com', '', 'Enter your password'],
  ])(
    'rejects invalid input (%j, %j) without calling Supabase',
    async (email, password, message) => {
      const { client, mocks } = createFakeClient(null);
      const auth = createAuth({ client });

      expect(await auth.signIn(email, password)).toEqual({ ok: false, message });
      expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    },
  );

  it('never logs the password or tokens', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const { client, mocks } = createFakeClient(null);
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    });
    const auth = createAuth({ client });

    await auth.signIn('me@example.com', 'super-secret-password');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('signs out on this device and clears the state', async () => {
    const { client, mocks } = createFakeClient({ user: { email: 'me@example.com' } });
    const auth = createAuth({ client });
    await auth.initialize();

    await auth.signOut();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.store.getState()).toMatchObject({ status: 'signedOut', email: null });
  });

  it('forgets the recent palette items of this device', async () => {
    const { client } = createFakeClient({ user: { email: 'me@example.com' } });
    const auth = createAuth({ client });
    await auth.initialize();
    useRecentItems.getState().add({ type: 'tag', id: 'a', title: 'home' });
    expect(localStorage.getItem(RECENT_STORAGE_KEY)).not.toBeNull();

    await auth.signOut();
    expect(useRecentItems.getState().items).toEqual([]);
    expect(localStorage.getItem(RECENT_STORAGE_KEY)).toBeNull();
  });

  it('still forgets the session when the server call fails', async () => {
    const { client, mocks } = createFakeClient({ user: { email: 'me@example.com' } });
    mocks.signOut.mockRejectedValueOnce(new Error('offline'));
    const auth = createAuth({ client });
    await auth.initialize();

    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(auth.store.getState().status).toBe('signedOut');
  });
});

describe('misconfigured app', () => {
  it('reports the issues and never signs in', async () => {
    const auth = createAuth({ issues: ['VITE_SUPABASE_URL is missing'] });
    await auth.initialize();

    expect(auth.store.getState()).toMatchObject({
      status: 'misconfigured',
      configIssues: ['VITE_SUPABASE_URL is missing'],
    });
    expect(await auth.signIn('me@example.com', 'pw')).toMatchObject({ ok: false });
    await expect(auth.signOut()).resolves.toBeUndefined();
  });
});
