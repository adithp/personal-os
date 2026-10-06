import { vi } from 'vitest';
import { createAuth, type Auth, type AuthClient } from '../auth/auth';

type Session = { user: { email: string } } | null;
type Listener = (event: string, session: Session) => void;

interface SignInResponse {
  data: { session: Session; user: { email: string } | null };
  error: { message: string; code?: string; status?: number } | null;
}

/** A stand-in for the Supabase auth client that tests can drive. */
export function createFakeClient(initialSession: Session = null) {
  let current = initialSession;
  const listeners = new Set<Listener>();

  const emit = (event: string, session: Session) => {
    current = session;
    for (const listener of listeners) listener(event, session);
  };

  const mocks = {
    getSession: vi.fn(() => Promise.resolve({ data: { session: current }, error: null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(listener);
            },
          },
        },
      };
    }),
    signInWithPassword: vi.fn(
      ({ email }: { email: string; password: string }): Promise<SignInResponse> => {
        const session = { user: { email } };
        current = session;
        return Promise.resolve({ data: { session, user: session.user }, error: null });
      },
    ),
    signOut: vi.fn(() => {
      emit('SIGNED_OUT', null);
      return Promise.resolve({ error: null });
    }),
  };

  return { client: mocks as unknown as AuthClient, mocks, emit, listeners };
}

export function signedInAuth(
  email = 'me@example.com',
): { auth: Auth } & ReturnType<typeof createFakeClient> {
  const fake = createFakeClient({ user: { email } });
  return { auth: createAuth({ client: fake.client }), ...fake };
}

export function signedOutAuth(): { auth: Auth } & ReturnType<typeof createFakeClient> {
  const fake = createFakeClient(null);
  return { auth: createAuth({ client: fake.client }), ...fake };
}
