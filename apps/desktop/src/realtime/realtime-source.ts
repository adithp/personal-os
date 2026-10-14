import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The part of the Supabase client that live updates use; tests pass a fake with the same shape.
 * It must be the same client the auth uses, so refreshed tokens reach the Realtime socket.
 */
export type RealtimeSource = Pick<SupabaseClient, 'channel' | 'removeChannel'>;
