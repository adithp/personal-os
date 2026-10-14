import type { DesktopEnv } from '@personal-os/shared';
import { parseDesktopEnv } from '@personal-os/shared';
import { createClient } from '@supabase/supabase-js';
import type { RealtimeSource } from '../realtime/realtime-source';
import { createAuth, type Auth } from './auth';

/**
 * Builds the app's auth and the live-updates source from the Vite env. Both use ONE Supabase
 * client, so refreshed login tokens also reach the Realtime socket. The client keeps the session
 * in local storage and refreshes it before it expires. Only the public anon key is used here.
 * `realtime` is null when the env is incomplete.
 */
export function createClientsFromEnv(raw: Record<string, unknown>): {
  auth: Auth;
  realtime: RealtimeSource | null;
} {
  const result = parseDesktopEnv(raw);
  if (!result.ok) return { auth: createAuth({ issues: result.issues }), realtime: null };
  const client = createSupabaseClient(result.env);
  return { auth: createAuth({ client: client.auth }), realtime: client };
}

export function createAuthFromEnv(raw: Record<string, unknown>): Auth {
  return createClientsFromEnv(raw).auth;
}

function createSupabaseClient(env: DesktopEnv) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}
