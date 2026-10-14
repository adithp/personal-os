import { REALTIME_TABLES } from '@personal-os/shared';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Auth } from '../auth/auth';
import type { RealtimeRegistry } from './registry';
import type { RealtimeSource } from './realtime-source';
import { setRealtimeStatus } from './realtime-store';

export interface RealtimeSyncOptions {
  source: RealtimeSource;
  auth: Auth;
  queryClient: QueryClient;
  registry: RealtimeRegistry;
  /** Events inside one window become one refetch per key. */
  windowMs?: number;
}

interface Session {
  stop: () => void;
}

// A new topic per start: the library hands back an existing channel for a topic still in use,
// which a StrictMode remount could find half closed.
let topicCounter = 0;

/**
 * Listens to Supabase Realtime (Postgres Changes) on the signed-in user's rows and marks the
 * matching cached queries stale. The event payload is never read or logged; only the table name
 * is used. Returns a function that stops everything.
 */
export function startRealtimeSync({
  source,
  auth,
  queryClient,
  registry,
  windowMs = 300,
}: RealtimeSyncOptions): () => void {
  let session: { userId: string; session: Session } | null = null;

  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    // An event must not overwrite an optimistic update that is still pending
    if (queryClient.isMutating() > 0) {
      timer = setTimeout(flush, windowMs);
      return;
    }
    const keys = [...pending.values()];
    pending.clear();
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  };

  const queue = (keys: readonly QueryKey[]) => {
    if (keys.length === 0) return;
    for (const key of keys) pending.set(JSON.stringify(key), key);
    timer ??= setTimeout(flush, windowMs);
  };

  const startSession = (userId: string): Session => {
    let active = true;
    let subscribedBefore = false;
    setRealtimeStatus('connecting');

    let channel = source.channel(`user-changes-${String(++topicCounter)}`);
    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        () => {
          if (active) queue(registry[table]);
        },
      );
    }
    channel.subscribe((status) => {
      if (!active) return;
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        setRealtimeStatus('live');
        // After a reconnect we may have missed events: refresh everything the registry knows
        if (subscribedBefore) queue(REALTIME_TABLES.flatMap((table) => registry[table]));
        subscribedBefore = true;
      } else {
        setRealtimeStatus('reconnecting');
      }
    });

    return {
      stop: () => {
        active = false;
        void source.removeChannel(channel);
      },
    };
  };

  const stopSession = () => {
    session?.session.stop();
    session = null;
    pending.clear();
    if (timer) clearTimeout(timer);
    timer = undefined;
    setRealtimeStatus('off');
  };

  const follow = () => {
    const { status, userId } = auth.store.getState();
    const wanted = status === 'signedIn' ? userId : null;
    if (session?.userId === wanted) return;
    if (session) stopSession();
    if (wanted) session = { userId: wanted, session: startSession(wanted) };
  };

  follow();
  const unsubscribe = auth.store.subscribe(follow);

  return () => {
    unsubscribe();
    stopSession();
  };
}
