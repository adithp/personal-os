import type { SupabaseClient } from '@supabase/supabase-js';
import { loginSchema } from '@personal-os/shared';
import type { StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** The part of the Supabase client the app uses; tests pass a fake with the same shape. */
export type AuthClient = Pick<
  SupabaseClient['auth'],
  'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut'
>;

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'misconfigured';

export interface AuthState {
  status: AuthStatus;
  email: string | null;
  /** Names of the env variables that are missing or wrong (never their values). */
  configIssues: string[];
}

export type SignInResult = { ok: true } | { ok: false; message: string };

export interface Auth {
  store: StoreApi<AuthState>;
  /** Restores the saved session and starts listening for changes. Safe to call many times. */
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** Signs out on this device only. */
  signOut: () => Promise<void>;
}

export type AuthSource = { client: AuthClient } | { issues: string[] };

const WRONG_CREDENTIALS = 'Wrong email or password.';
const GENERIC_ERROR = 'Could not sign in. Check your connection and try again.';

type SessionLike = { user: { email?: string | null } } | null;

function stateFor(session: SessionLike): AuthState {
  return {
    status: session ? 'signedIn' : 'signedOut',
    email: session?.user.email ?? null,
    configIssues: [],
  };
}

/** Maps a Supabase sign-in error to a short message without leaking details. */
function messageFor(error: { code?: string; status?: number; message: string }): string {
  if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') {
    return WRONG_CREDENTIALS;
  }
  return GENERIC_ERROR;
}

export function createAuth(source: AuthSource): Auth {
  const store = createStore<AuthState>(() =>
    'issues' in source
      ? { status: 'misconfigured', email: null, configIssues: source.issues }
      : { status: 'loading', email: null, configIssues: [] },
  );

  let initialized: Promise<void> | undefined;

  const initialize = () => {
    if ('issues' in source) return Promise.resolve();
    const { client } = source;
    initialized ??= (async () => {
      client.onAuthStateChange((_event, session) => {
        store.setState(stateFor(session));
      });
      try {
        const { data } = await client.getSession();
        store.setState(stateFor(data.session));
      } catch {
        store.setState(stateFor(null));
      }
    })();
    return initialized;
  };

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    if ('issues' in source) return { ok: false, message: 'The app is not configured.' };

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check your details.' };
    }

    try {
      const { data, error } = await source.client.signInWithPassword(parsed.data);
      if (error) return { ok: false, message: messageFor(error) };
      store.setState(stateFor(data.session));
      return { ok: true };
    } catch {
      return { ok: false, message: GENERIC_ERROR };
    }
  };

  const signOut = async () => {
    if ('issues' in source) return;
    try {
      await source.client.signOut({ scope: 'local' });
    } catch {
      // The server could not be reached. This device still forgets the session below.
    }
    store.setState(stateFor(null));
  };

  return { store, initialize, signIn, signOut };
}
