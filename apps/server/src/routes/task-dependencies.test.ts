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

const UNKNOWN = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

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
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

interface Item {
  id: string;
  title: string;
  blockedBy: { id: string; title: string }[];
}
interface Written {
  item: Item;
  undo: { action: string; input: Record<string, unknown> } | null;
}

async function createTask(title: string, headers = alice) {
  return (await call('POST', '/tasks', headers, { title })).json<Written>().item;
}

const add = (id: string, blockerId: string, headers = alice) =>
  call('POST', `/tasks/${id}/blockers`, headers, { blockerId });

describe('login is required on the blocker routes', () => {
  it.each([
    ['POST', `/tasks/${UNKNOWN}/blockers`],
    ['DELETE', `/tasks/${UNKNOWN}/blockers/${UNKNOWN}`],
  ] as const)(
    '%s %s answers 401 with no token, a stranger token, or an expired one',
    async (method, url) => {
      const payload = method === 'POST' ? { blockerId: UNKNOWN } : undefined;
      const stranger = { authorization: `Bearer ${await keys.signWithUnknownKey()}` };
      const expired = { authorization: `Bearer ${await keys.sign({ expiresIn: -60 })}` };
      for (const headers of [{}, stranger, expired]) {
        const response = await call(method, url, headers, payload);
        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
      }
    },
  );
});

describe('POST /tasks/:id/blockers', () => {
  it('adds a blocker and answers { item, undo }', async () => {
    const a = await createTask('Blocker');
    const b = await createTask('Blocked');
    const response = await add(b.id, a.id);
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item.blockedBy).toEqual([{ id: a.id, title: 'Blocker' }]);
    expect(body.undo).toEqual({
      action: 'tasks.removeBlocker',
      input: { id: b.id, blockerId: a.id },
    });
    const listed = (await call('GET', '/tasks')).json<{ items: Item[] }>().items;
    expect(listed.find((x) => x.id === b.id)?.blockedBy).toHaveLength(1);
  });

  it('answers undo null when the blocker is already there', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await add(b.id, a.id);
    const again = await add(b.id, a.id);
    expect(again.statusCode).toBe(200);
    expect(again.json<Written>().undo).toBeNull();
  });

  it('answers 400 for a bad body, a bad id, and a task blocking itself', async () => {
    const a = await createTask('A');
    expect((await call('POST', `/tasks/${a.id}/blockers`, alice, {})).statusCode).toBe(400);
    expect(
      (await call('POST', `/tasks/${a.id}/blockers`, alice, { blockerId: 'x' })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/tasks/nope/blockers', alice, { blockerId: a.id })).statusCode,
    ).toBe(400);
    const self = await add(a.id, a.id);
    expect(self.statusCode).toBe(400);
    expect(self.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('answers 404 for unknown tasks and for another user tasks', async () => {
    const mine = await createTask('Mine');
    const theirs = await createTask('Theirs', bob);
    expect((await add(mine.id, UNKNOWN)).statusCode).toBe(404);
    expect((await add(UNKNOWN, mine.id)).statusCode).toBe(404);
    expect((await add(mine.id, theirs.id)).statusCode).toBe(404);
    expect((await add(theirs.id, mine.id)).statusCode).toBe(404);
    const theirView = (await call('GET', `/tasks/${theirs.id}`, bob)).json<{ item: Item }>();
    expect(theirView.item.blockedBy).toEqual([]);
  });

  it('answers 409 circular_dependency for a cycle', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await add(b.id, a.id);
    const response = await add(a.id, b.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'circular_dependency' } });
  });

  it('makes completing the blocked task answer 409 blocked until the blocker is done', async () => {
    const a = await createTask('Blocker');
    const b = await createTask('Blocked');
    await add(b.id, a.id);
    const refused = await call('POST', `/tasks/${b.id}/complete`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      error: { code: 'blocked', message: 'Blocked by: Blocker' },
    });
    await call('POST', `/tasks/${a.id}/complete`);
    expect((await call('POST', `/tasks/${b.id}/complete`)).statusCode).toBe(200);
  });

  it('undoes through POST /undo', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    const { undo } = (await add(b.id, a.id)).json<Written>();
    expect((await call('POST', '/undo', alice, undo)).statusCode).toBe(200);
    expect((await call('GET', `/tasks/${b.id}`)).json<{ item: Item }>().item.blockedBy).toEqual([]);
  });
});

describe('DELETE /tasks/:id/blockers/:blockerId', () => {
  it('removes the blocker and answers { item, undo }, and undo adds it back', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await add(b.id, a.id);
    const response = await call('DELETE', `/tasks/${b.id}/blockers/${a.id}`);
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item.blockedBy).toEqual([]);
    expect(body.undo).toEqual({ action: 'tasks.addBlocker', input: { id: b.id, blockerId: a.id } });
    expect((await call('POST', '/undo', alice, body.undo)).statusCode).toBe(200);
    expect(
      (await call('GET', `/tasks/${b.id}`)).json<{ item: Item }>().item.blockedBy,
    ).toHaveLength(1);
  });

  it('answers undo null when there is no such blocker', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    const response = await call('DELETE', `/tasks/${b.id}/blockers/${a.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json<Written>().undo).toBeNull();
  });

  it('answers 400 for bad ids and 404 for unknown or foreign tasks', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await add(b.id, a.id);
    expect((await call('DELETE', `/tasks/${b.id}/blockers/nope`)).statusCode).toBe(400);
    expect((await call('DELETE', `/tasks/${UNKNOWN}/blockers/${a.id}`)).statusCode).toBe(404);
    expect((await call('DELETE', `/tasks/${b.id}/blockers/${a.id}`, bob)).statusCode).toBe(404);
    expect(
      (await call('GET', `/tasks/${b.id}`)).json<{ item: Item }>().item.blockedBy,
    ).toHaveLength(1);
  });
});
