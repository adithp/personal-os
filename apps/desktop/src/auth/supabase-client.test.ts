import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthFromEnv } from './supabase-client';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  })),
}));

const env = {
  VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-anon-key-value',
  VITE_API_URL: 'http://127.0.0.1:3000/api/v1',
};

beforeEach(() => {
  vi.mocked(createClient).mockClear();
});

describe('createAuthFromEnv', () => {
  it('creates a client with the URL and anon key that keeps and refreshes the session', () => {
    createAuthFromEnv(env);
    expect(createClient).toHaveBeenCalledWith(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  });

  it('shows a configuration error and creates no client when the env is incomplete', () => {
    const auth = createAuthFromEnv({ VITE_SUPABASE_URL: 'https://xxxx.supabase.co' });
    expect(createClient).not.toHaveBeenCalled();
    expect(auth.store.getState().status).toBe('misconfigured');
    expect(auth.store.getState().configIssues.join(' ')).toContain('VITE_SUPABASE_ANON_KEY');
  });
});
