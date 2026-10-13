import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
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
    sql`truncate table task_favorites, entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
  await createTestUser(t.db, USER_ID);
  await createTestUser(t.db, OTHER_USER_ID);
  app = buildApp({ env, verifier: keys.verifier, db: t.db });
});

afterEach(async () => {
  await app.close();
});

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

interface FavoriteItem {
  id: string;
  name: string;
  color: string;
  icon: string;
  position: number;
  view: Record<string, unknown>;
}
interface Written {
  item: FavoriteItem;
  undo: { action: string; input: Record<string, unknown> } | null;
}

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

const add = async (name: string, view: Record<string, unknown>, headers = alice) =>
  (await call('POST', '/task-favorites', headers, { name, view })).json<Written>();
const names = async (headers = alice) =>
  (await call('GET', '/task-favorites', headers))
    .json<{ items: FavoriteItem[] }>()
    .items.map((item) => item.name);

describe('login is required on every favorite route', () => {
  it.each([
    ['GET', '/task-favorites'],
    ['POST', '/task-favorites'],
    ['PATCH', `/task-favorites/${MISSING}`],
    ['DELETE', `/task-favorites/${MISSING}`],
    ['POST', `/task-favorites/${MISSING}/move`],
  ])('%s %s answers 401 with no token', async (method, url) => {
    const response = await call(method as 'GET', url, {}, method === 'GET' ? undefined : {});
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });
});

describe('GET /task-favorites', () => {
  it('lists only the signed-in user favorites as items', async () => {
    await add('Mine', { sort: 'due' });
    await add('Bobs', { sort: 'title' }, bob);
    const response = await call('GET', '/task-favorites');
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: FavoriteItem[] }>().items).toMatchObject([
      { name: 'Mine', icon: 'star', view: { sort: 'due' } },
    ]);
  });
});

describe('POST /task-favorites', () => {
  it('answers 201 with the item and an undo that removes it', async () => {
    const response = await call('POST', '/task-favorites', alice, {
      name: 'Urgent',
      view: { priority: [1] },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<Written>();
    expect(body.item).toMatchObject({ name: 'Urgent', icon: 'flag', position: 1024 });
    expect(body.undo).toEqual({ action: 'favorites.delete', input: { id: body.item.id } });
    const undone = await call('POST', '/undo', alice, body.undo);
    expect(undone.statusCode).toBe(200);
    expect(await names()).toEqual([]);
  });

  it('answers 400 for an empty view, a bad color, or an unknown tag', async () => {
    for (const payload of [
      { name: 'X', view: {} },
      { name: 'X', view: { sort: 'due' }, color: '#123456' },
      { name: '', view: { sort: 'due' } },
      { name: 'X', view: { tagIds: [MISSING] } },
    ]) {
      const response = await call('POST', '/task-favorites', alice, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    }
  });

  it('returns the existing favorite for the same view with no undo', async () => {
    const first = await add('A', { status: ['todo', 'done'] });
    const again = await call('POST', '/task-favorites', alice, {
      name: 'B',
      view: { status: ['done', 'todo'] },
    });
    expect(again.json<Written>()).toMatchObject({ item: { id: first.item.id }, undo: null });
  });

  it('answers 409 favorites_limit at 12 favorites', async () => {
    const sorts = ['manual', 'due', 'priority', 'created', 'title'];
    const groups = ['due', 'none', 'tag'];
    for (let index = 0; index < 12; index++) {
      await add(`F${String(index)}`, {
        sort: sorts[index % 5],
        group: groups[Math.floor(index / 5)],
      });
    }
    const response = await call('POST', '/task-favorites', alice, {
      name: 'Extra',
      view: { priority: [1] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'favorites_limit' } });
  });
});

describe('PATCH /task-favorites/:id', () => {
  it('renames, returns the undo, and the undo restores the old name', async () => {
    const { item } = await add('Old', { sort: 'due' });
    const response = await call('PATCH', `/task-favorites/${item.id}`, alice, { name: 'New' });
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item.name).toBe('New');
    await call('POST', '/undo', alice, body.undo);
    expect(await names()).toEqual(['Old']);
  });

  it('answers 400 for no change or a bad id, and 404 for unknown and foreign ids', async () => {
    const { item } = await add('Mine', { sort: 'due' });
    expect((await call('PATCH', `/task-favorites/${item.id}`, alice, {})).statusCode).toBe(400);
    expect(
      (await call('PATCH', '/task-favorites/not-an-id', alice, { name: 'x' })).statusCode,
    ).toBe(400);
    expect(
      (await call('PATCH', `/task-favorites/${MISSING}`, alice, { name: 'x' })).statusCode,
    ).toBe(404);
    expect((await call('PATCH', `/task-favorites/${item.id}`, bob, { name: 'x' })).statusCode).toBe(
      404,
    );
    expect(await names()).toEqual(['Mine']);
  });

  it('uses the id from the path, not the body', async () => {
    const mine = (await add('Mine', { sort: 'due' })).item;
    const bobs = (await add('Bobs', { sort: 'title' }, bob)).item;
    await call('PATCH', `/task-favorites/${mine.id}`, alice, { id: bobs.id, name: 'changed' });
    expect(await names(bob)).toEqual(['Bobs']);
    expect(await names()).toEqual(['changed']);
  });
});

describe('POST /task-favorites/:id/move', () => {
  it('moves, and the undo puts it back', async () => {
    const a = (await add('A', { sort: 'due' })).item;
    await add('B', { sort: 'title' });
    const c = (await add('C', { sort: 'created' })).item;
    const response = await call('POST', `/task-favorites/${a.id}/move`, alice, { afterId: c.id });
    expect(response.statusCode).toBe(200);
    expect(await names()).toEqual(['B', 'C', 'A']);
    await call('POST', '/undo', alice, response.json<Written>().undo);
    expect(await names()).toEqual(['A', 'B', 'C']);
  });

  it('answers 400 with no neighbour, 404 for unknown and foreign ones', async () => {
    const a = (await add('A', { sort: 'due' })).item;
    const bobs = (await add('Bobs', { sort: 'due' }, bob)).item;
    expect((await call('POST', `/task-favorites/${a.id}/move`, alice, {})).statusCode).toBe(400);
    expect(
      (await call('POST', `/task-favorites/${a.id}/move`, alice, { afterId: a.id })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/task-favorites/${a.id}/move`, alice, { afterId: MISSING })).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/task-favorites/${a.id}/move`, alice, { afterId: bobs.id })).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/task-favorites/${a.id}/move`, bob, { afterId: bobs.id })).statusCode,
    ).toBe(404);
  });
});

describe('DELETE /task-favorites/:id', () => {
  it('removes the favorite, and the undo brings it back', async () => {
    const { item } = await add('A', { sort: 'due' });
    const response = await call('DELETE', `/task-favorites/${item.id}`);
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.undo).toEqual({ action: 'favorites.restore', input: { id: item.id } });
    expect(await names()).toEqual([]);
    await call('POST', '/undo', alice, body.undo);
    expect(await names()).toEqual(['A']);
  });

  it('answers 404 for a second delete, unknown ids, and other users', async () => {
    const { item } = await add('A', { sort: 'due' });
    expect((await call('DELETE', `/task-favorites/${item.id}`, bob)).statusCode).toBe(404);
    expect((await call('DELETE', `/task-favorites/${MISSING}`)).statusCode).toBe(404);
    await call('DELETE', `/task-favorites/${item.id}`);
    expect((await call('DELETE', `/task-favorites/${item.id}`)).statusCode).toBe(404);
    expect((await call('DELETE', '/task-favorites/nope')).statusCode).toBe(400);
  });
});
