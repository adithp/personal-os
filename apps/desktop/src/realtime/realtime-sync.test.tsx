import { REALTIME_TABLES } from '@personal-os/shared';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from '../api/providers';
import { FAKE_USER_ID, signedInAuth, signedOutAuth } from '../test/fake-auth';
import { createFakeApi } from '../test/fake-api';
import { createFakeRealtime } from '../test/fake-realtime';
import { realtimeRegistry } from './registry';
import { useRealtimeStore } from './realtime-store';
import { startRealtimeSync } from './realtime-sync';

let queryClient: QueryClient;
let invalidate: MockInstance<QueryClient['invalidateQueries']>;

beforeEach(() => {
  vi.useFakeTimers();
  queryClient = new QueryClient();
  invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  useRealtimeStore.setState({ status: 'off' });
});

afterEach(() => {
  vi.useRealTimers();
});

const invalidatedKeys = () =>
  invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);

async function start() {
  const fake = createFakeRealtime();
  const { auth, ...authFake } = signedInAuth();
  await auth.initialize();
  const stop = startRealtimeSync({
    source: fake.source,
    auth,
    queryClient,
    registry: realtimeRegistry,
  });
  return { fake, auth, authFake, stop };
}

describe('startRealtimeSync', () => {
  it('listens to every realtime table, only for the signed-in user', async () => {
    const { fake } = await start();
    const bindings = fake.channels[0]?.bindings ?? [];
    expect(bindings.map((b) => b.table).sort()).toEqual([...REALTIME_TABLES].sort());
    for (const b of bindings) {
      expect(b.filter).toBe(`user_id=eq.${FAKE_USER_ID}`);
      expect(b.event).toBe('*');
    }
    expect(useRealtimeStore.getState().status).toBe('connecting');
  });

  it('marks the mapped keys stale 300 ms after an event, not before', async () => {
    const { fake } = await start();
    fake.setStatus('SUBSCRIBED');
    fake.emit('tags');
    vi.advanceTimersByTime(299);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidatedKeys()).toEqual([['tags'], ['tasks']]);
  });

  it('turns ten events in one window into one invalidation per key', async () => {
    const { fake } = await start();
    fake.setStatus('SUBSCRIBED');
    for (let i = 0; i < 10; i++) fake.emit('tasks');
    fake.emit('links');
    fake.emit('entity_tags');
    vi.advanceTimersByTime(300);
    expect(invalidatedKeys().sort()).toEqual([['tags'], ['tasks']]);
  });

  it('refreshes goals and tasks when a goal changes, and favorites when a favorite changes', async () => {
    const { fake } = await start();
    fake.emit('goals');
    fake.emit('task_favorites');
    vi.advanceTimersByTime(300);
    expect(invalidatedKeys()).toEqual([['goals'], ['tasks'], ['task-favorites']]);
  });

  it('ignores a table it has no keys for', async () => {
    const { fake } = await start();
    fake.emit('something_else');
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('waits while a change of our own is still being saved', async () => {
    const { fake } = await start();
    const mutating = vi.spyOn(queryClient, 'isMutating').mockReturnValue(1);
    fake.emit('tasks');
    vi.advanceTimersByTime(900);
    expect(invalidate).not.toHaveBeenCalled();
    mutating.mockReturnValue(0);
    vi.advanceTimersByTime(300);
    expect(invalidatedKeys()).toEqual([['tasks']]);
  });

  it('stops waiting for a change that never finishes saving', async () => {
    const { fake } = await start();
    vi.spyOn(queryClient, 'isMutating').mockReturnValue(1);
    fake.emit('tasks');
    vi.advanceTimersByTime(10_000);
    expect(invalidatedKeys()).toEqual([['tasks']]);
  });

  it('does nothing on the first SUBSCRIBED, and refreshes every registry key on the next one', async () => {
    const { fake } = await start();
    fake.setStatus('SUBSCRIBED');
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();

    fake.setStatus('CHANNEL_ERROR');
    expect(useRealtimeStore.getState().status).toBe('reconnecting');
    fake.setStatus('SUBSCRIBED');
    expect(useRealtimeStore.getState().status).toBe('live');
    vi.advanceTimersByTime(300);
    expect(invalidatedKeys().sort()).toEqual([['goals'], ['tags'], ['task-favorites'], ['tasks']]);
  });

  it('shows connecting, live, reconnecting for TIMED_OUT and CLOSED, then off after stopping', async () => {
    const { fake, stop } = await start();
    expect(useRealtimeStore.getState().status).toBe('connecting');
    fake.setStatus('SUBSCRIBED');
    expect(useRealtimeStore.getState().status).toBe('live');
    fake.setStatus('TIMED_OUT');
    expect(useRealtimeStore.getState().status).toBe('reconnecting');
    fake.setStatus('CLOSED');
    expect(useRealtimeStore.getState().status).toBe('reconnecting');
    stop();
    expect(useRealtimeStore.getState().status).toBe('off');
  });

  it('removes the channel and drops pending work when the user signs out', async () => {
    const { fake, authFake } = await start();
    fake.setStatus('SUBSCRIBED');
    fake.emit('tasks');
    authFake.emit('SIGNED_OUT', null);
    expect(fake.channels[0]?.removed).toBe(true);
    expect(useRealtimeStore.getState().status).toBe('off');
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('starts when the user signs in later, with that user id', async () => {
    const fake = createFakeRealtime();
    const { auth, emit } = signedOutAuth();
    await auth.initialize();
    startRealtimeSync({ source: fake.source, auth, queryClient, registry: realtimeRegistry });
    expect(fake.channel).not.toHaveBeenCalled();

    emit('SIGNED_IN', { user: { id: 'user-2', email: 'a@b.co' }, access_token: 't' });
    expect(fake.channels[0]?.bindings[0]?.filter).toBe('user_id=eq.user-2');
  });

  it('uses a new topic for every start (StrictMode mounts twice)', async () => {
    const fake = createFakeRealtime();
    const { auth } = signedInAuth();
    await auth.initialize();
    const api = createFakeApi().api;
    render(
      <StrictMode>
        <AppProviders api={api} queryClient={queryClient} realtime={{ source: fake.source, auth }}>
          <div />
        </AppProviders>
      </StrictMode>,
    );
    const topics = fake.channels.map((c) => c.topic);
    expect(topics).toHaveLength(2);
    expect(new Set(topics).size).toBe(2);
    expect(fake.channels.filter((c) => !c.removed)).toHaveLength(1);
  });
});
