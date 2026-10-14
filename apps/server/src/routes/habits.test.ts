import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { loadEnv } from '../config/env';
import {
  OTHER_USER_ID,
  TEST_DATABASE_URL,
  TEST_SUPABASE_URL,
  USER_ID,
  createTestKeys,
  type TestKeys,
} from '../test/jwt';

const env = loadEnv({
  SUPABASE_URL: TEST_SUPABASE_URL,
  DATABASE_URL: TEST_DATABASE_URL,
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
});

let t: TestDb;
let keys: TestKeys;
let app: FastifyInstance;
let alice: Record<string, string>;
let bob: Record<string, string>;

beforeAll(async () => {
  t = await createTestDb();
  keys = await createTestKeys();
  alice = { authorization: `Bearer ${await keys.sign({ sub: USER_ID })}` };
  bob = { authorization: `Bearer ${await keys.sign({ sub: OTHER_USER_ID })}` };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T04:30:00Z'));
});
afterAll(async () => {
  vi.useRealTimers();
  await t.close();
});
beforeEach(async () => {
  await t.db.execute(sql`truncate table habit_logs, habits, auth.users cascade`);
  await createTestUser(t.db, USER_ID);
  await createTestUser(t.db, OTHER_USER_ID);
  app = buildApp({ env, verifier: keys.verifier, db: t.db });
});
afterEach(async () => {
  await app.close();
});

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

interface Written {
  item: {
    id: string;
    name: string;
    archivedAt: string | null;
    currentStreak: number;
    today: { done: boolean; count: number };
  };
  undo: { action: string; input: Record<string, unknown> } | null;
}

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';
const add = async (name = 'Read', headers = alice) =>
  (await call('POST', '/habits', headers, { name })).json<Written>();

describe('habits routes', () => {
  it('needs a token', async () => {
    expect((await call('GET', '/habits', {})).statusCode).toBe(401);
  });

  it('POST creates (201) and returns an undo; bad input is a 400', async () => {
    const response = await call('POST', '/habits', alice, { name: 'Read' });
    expect(response.statusCode).toBe(201);
    expect(response.json<Written>().undo?.action).toBe('habits.archive');
    expect((await call('POST', '/habits', alice, { name: '' })).statusCode).toBe(400);
  });

  it('GET lists the own habits, archived with ?archived=true', async () => {
    const one = await add('One');
    const two = await add('Two');
    await add('Bobs', bob);
    await call('POST', `/habits/${two.item.id}/archive`);
    const active = (await call('GET', '/habits')).json<{ items: Written['item'][] }>();
    expect(active.items.map((habit) => habit.id)).toEqual([one.item.id]);
    const archived = (await call('GET', '/habits?archived=true')).json<{
      items: Written['item'][];
    }>();
    expect(archived.items.map((habit) => habit.id)).toEqual([two.item.id]);
  });

  it('GET one, PATCH, and 404 for missing or other users', async () => {
    const { item } = await add();
    expect((await call('GET', `/habits/${item.id}`)).statusCode).toBe(200);
    const patched = await call('PATCH', `/habits/${item.id}`, alice, { name: 'Write' });
    expect(patched.json<Written>().item.name).toBe('Write');
    expect((await call('GET', `/habits/${MISSING}`)).statusCode).toBe(404);
    expect((await call('GET', `/habits/${item.id}`, bob)).statusCode).toBe(404);
    expect((await call('PATCH', `/habits/${item.id}`, bob, { name: 'x' })).statusCode).toBe(404);
    expect((await call('GET', '/habits/not-an-id')).statusCode).toBe(400);
  });

  it('archive and restore', async () => {
    const { item } = await add();
    const archived = await call('POST', `/habits/${item.id}/archive`);
    expect(archived.json<Written>().item.archivedAt).not.toBeNull();
    const restored = await call('POST', `/habits/${item.id}/restore`);
    expect(restored.json<Written>().item.archivedAt).toBeNull();
  });

  it('PUT log marks done, DELETE log removes it', async () => {
    const { item } = await add();
    const logged = await call('PUT', `/habits/${item.id}/log`, alice, {});
    expect(logged.json<Written>().item.today.done).toBe(true);
    expect(logged.json<Written>().item.currentStreak).toBe(1);
    const removed = await call('DELETE', `/habits/${item.id}/log?date=2026-10-14`);
    expect(removed.json<Written>().item.today.done).toBe(false);
    expect(
      (await call('PUT', `/habits/${item.id}/log`, alice, { date: '2026-10-20' })).statusCode,
    ).toBe(400);
    expect((await call('PUT', `/habits/${item.id}/log`, bob, {})).statusCode).toBe(404);
  });

  it('GET stats', async () => {
    const { item } = await add();
    await call('PUT', `/habits/${item.id}/log`, alice, {});
    const response = await call('GET', `/habits/${item.id}/stats?range=week`);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ item: { doneCount: number; days: unknown[] } }>();
    expect(body.item.doneCount).toBe(1);
    expect(body.item.days).toHaveLength(7);
    expect((await call('GET', `/habits/${item.id}/stats?range=decade`)).statusCode).toBe(400);
  });
});
