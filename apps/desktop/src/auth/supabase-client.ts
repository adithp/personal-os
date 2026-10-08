import type { DesktopEnv } from '@personal-os/shared';
import { parseDesktopEnv } from '@personal-os/shared';
import { createClient } from '@supabase/supabase-js';
import { createAuth, type Auth } from './auth';

/**
 * Builds the app's auth from the Vite env. The Supabase client keeps the session in local
 * storage and refreshes it before it expires. Only the public anon key is used here.
 */
export function createAuthFromEnv(raw: Record<string, unknown>): Auth {
  const result = parseDesktopEnv(raw);
  if (!result.ok) return createAuth({ issues: result.issues });
  return createAuth({ client: createSupabaseClient(result.env).auth });
}

function createSupabaseClient(env: DesktopEnv) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}
