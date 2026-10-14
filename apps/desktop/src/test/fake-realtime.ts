import { vi } from 'vitest';
import type { RealtimeSource } from '../realtime/realtime-source';

export interface FakeBinding {
  table: string;
  filter: string | undefined;
  event: string;
  callback: () => void;
}

export interface FakeChannel {
  topic: string;
  bindings: FakeBinding[];
  removed: boolean;
}

type StatusCallback = (status: string) => void;

/** A stand-in for the Supabase client's Realtime part. No socket; tests drive it. */
export function createFakeRealtime() {
  const channels: FakeChannel[] = [];
  const statusCallbacks = new Map<FakeChannel, StatusCallback>();

  const channel = vi.fn((topic: string) => {
    const state: FakeChannel = { topic, bindings: [], removed: false };
    channels.push(state);
    const chain = {
      on: (
        _type: string,
        filter: { event: string; table: string; filter?: string },
        callback: () => void,
      ) => {
        state.bindings.push({
          table: filter.table,
          filter: filter.filter,
          event: filter.event,
          callback,
        });
        return chain;
      },
      subscribe: (callback: StatusCallback) => {
        statusCallbacks.set(state, callback);
        return chain;
      },
    };
    return chain;
  });

  const removeChannel = vi.fn((chain: unknown) => {
    const index = channel.mock.results.findIndex((result) => result.value === chain);
    const state = channels[index];
    if (state) {
      state.removed = true;
      // The real library reports CLOSED to the subscriber when a channel is removed
      statusCallbacks.get(state)?.('CLOSED');
    }
    return Promise.resolve('ok' as const);
  });

  const live = () => channels.filter((c) => !c.removed);
  const current = () => {
    const last = live().at(-1);
    if (!last) throw new Error('No live channel');
    return last;
  };

  return {
    source: { channel, removeChannel } as unknown as RealtimeSource,
    channel,
    removeChannel,
    channels,
    /** A change event on a table, delivered to every live channel that listens to it. */
    emit: (table: string) => {
      for (const c of live()) {
        for (const binding of c.bindings) if (binding.table === table) binding.callback();
      }
    },
    /** Reports a subscribe status (SUBSCRIBED, CHANNEL_ERROR, ...) on the newest live channel. */
    setStatus: (status: string) => {
      statusCallbacks.get(current())?.(status);
    },
  };
}
