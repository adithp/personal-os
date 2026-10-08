import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(
    sql`truncate table entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
  await createTestUser(t.db, USER_ID);
  await createTestUser(t.db, OTHER_USER_ID);
  app = buildApp({ env, verifier: keys.verifier, db: t.db });
});

afterEach(async () => {
  await app.close();
});

const call = (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

interface TagItem {
  id: string;
  name: string;
  color: string;
}
interface Written {
  item: TagItem & { created?: boolean };
  undo: { action: string; input: Record<string, unknown> } | null;
}

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

describe('login is required on every tag route', () => {
  it.each([
    ['GET', '/tags'],
    ['POST', '/tags'],
    ['PATCH', `/tags/${MISSING}`],
  ])('%s %s answers 401 with no token', async (method, url) => {
    const response = await call(method as 'GET', url, {}, method === 'GET' ? undefined : {});
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });
});

describe('POST /tags', () => {
  it('answers 201 for a new tag and 200 for an existing name (ignoring case)', async () => {
    const created = await call('POST', '/tags', alice, { name: 'Work' });
    expect(created.statusCode).toBe(201);
    const body = created.json<Written>();
    expect(body.item).toMatchObject({ name: 'Work' });
    expect(body.item).not.toHaveProperty('created');
    expect(body.undo).toBeNull();

    const again = await call('POST', '/tags', alice, { name: 'work' });
    expect(again.statusCode).toBe(200);
    expect(again.json<Written>().item.id).toBe(body.item.id);
  });

  it('answers 400 for bad input', async () => {
    for (const payload of [{}, { name: '' }, { name: 'a b' }, { name: 'a', color: 'red' }]) {
      const response = await call('POST', '/tags', alice, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    }
  });
});

describe('GET /tags', () => {
  it('lists only the signed-in user’s tags, oldest first', async () => {
    await call('POST', '/tags', alice, { name: 'b' });
    await call('POST', '/tags', alice, { name: 'a' });
    await call('POST', '/tags', bob, { name: 'bobs' });
    const response = await call('GET', '/tags');
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: TagItem[] }>().items.map((tag) => tag.name)).toEqual(['b', 'a']);
  });
});

describe('PATCH /tags/:id', () => {
  it('renames, returns an undo, and the undo works', async () => {
    const { item } = (await call('POST', '/tags', alice, { name: 'work' })).json<Written>();
    const response = await call('PATCH', `/tags/${item.id}`, alice, { name: 'job' });
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item.name).toBe('job');
    const undone = await call('POST', '/undo', alice, body.undo);
    expect(undone.statusCode).toBe(200);
    expect((await call('GET', '/tags')).json<{ items: TagItem[] }>().items[0]?.name).toBe('work');
  });

  it('uses the id from the path, not the body', async () => {
    const mine = (await call('POST', '/tags', alice, { name: 'mine' })).json<Written>().item;
    const bobs = (await call('POST', '/tags', bob, { name: 'bobs' })).json<Written>().item;
    await call('PATCH', `/tags/${mine.id}`, alice, { id: bobs.id, name: 'changed' });
    expect((await call('GET', '/tags', bob)).json<{ items: TagItem[] }>().items[0]?.name).toBe(
      'bobs',
    );
  });

  it('answers 409 on a name clash, 404 for another user’s tag, 400 for bad input', async () => {
    await call('POST', '/tags', alice, { name: 'one' });
    const two = (await call('POST', '/tags', alice, { name: 'two' })).json<Written>().item;
    const clash = await call('PATCH', `/tags/${two.id}`, alice, { name: 'ONE' });
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toMatchObject({ error: { code: 'conflict' } });

    expect((await call('PATCH', `/tags/${two.id}`, bob, { name: 'x' })).statusCode).toBe(404);
    expect((await call('PATCH', `/tags/${MISSING}`, alice, { name: 'x' })).statusCode).toBe(404);
    expect((await call('PATCH', `/tags/${two.id}`, alice, {})).statusCode).toBe(400);
    expect((await call('PATCH', '/tags/nope', alice, { name: 'x' })).statusCode).toBe(400);
  });
});
