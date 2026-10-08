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

interface Item {
  id: string;
  status: string;
  position: number;
}
interface Written {
  item: Item;
  undo: { action: string; input: Record<string, unknown> } | null;
}

const call = (
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

async function createTask(title: string, headers = alice) {
  return (await call('POST', '/tasks', headers, { title })).json<Written>().item;
}

const UNKNOWN = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

describe('POST /tasks/:id/move', () => {
  it('answers 401 with no token, a stranger token, or an expired one', async () => {
    const url = `/tasks/${UNKNOWN}/move`;
    expect((await call('POST', url, {}, { status: 'doing' })).statusCode).toBe(401);
    const stranger = { authorization: `Bearer ${await keys.signWithUnknownKey()}` };
    const expired = { authorization: `Bearer ${await keys.sign({ expiresIn: -60 })}` };
    expect((await call('POST', url, stranger, { status: 'doing' })).statusCode).toBe(401);
    expect((await call('POST', url, expired, { status: 'doing' })).statusCode).toBe(401);
  });

  it('moves a task and answers { item, undo }', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    const c = await createTask('C');
    const response = await call('POST', `/tasks/${c.id}/move`, alice, {
      status: 'doing',
      afterId: a.id,
      beforeId: b.id,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item).toMatchObject({ id: c.id, status: 'doing' });
    expect(body.item.position).toBe((a.position + b.position) / 2);
    expect(body.undo).toMatchObject({ action: 'tasks.update' });
  });

  it('puts the old status and position back through POST /undo', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    const moved = (
      await call('POST', `/tasks/${b.id}/move`, alice, { status: 'doing', beforeId: a.id })
    ).json<Written>();
    expect((await call('POST', '/undo', alice, moved.undo)).statusCode).toBe(200);
    const back = (await call('GET', `/tasks/${b.id}`)).json<{ item: Item }>().item;
    expect(back).toMatchObject({ status: 'todo', position: b.position });
  });

  it('answers 400 for a bad body, an empty move, and a bad neighbour', async () => {
    const a = await createTask('A');
    const url = `/tasks/${a.id}/move`;
    expect((await call('POST', url, alice, { status: 'flying' })).statusCode).toBe(400);
    expect((await call('POST', url, alice, {})).statusCode).toBe(400);
    expect((await call('POST', url, alice, { afterId: 'nope' })).statusCode).toBe(400);
    expect((await call('POST', url, alice, { afterId: a.id })).statusCode).toBe(400);
    expect(
      (await call('POST', `/tasks/not-an-id/move`, alice, { status: 'doing' })).statusCode,
    ).toBe(400);
  });

  it('answers 404 for an unknown id and for another user task', async () => {
    const theirs = await createTask('Theirs', bob);
    const mine = await createTask('Mine');
    const unknown = await call('POST', `/tasks/${UNKNOWN}/move`, alice, { status: 'doing' });
    const other = await call('POST', `/tasks/${theirs.id}/move`, alice, { status: 'doing' });
    const neighbour = await call('POST', `/tasks/${mine.id}/move`, alice, { afterId: theirs.id });
    for (const response of [unknown, other, neighbour]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: 'not_found' } });
    }
    const stillTheirs = (await call('GET', `/tasks/${theirs.id}`, bob)).json<{ item: Item }>();
    expect(stillTheirs.item.status).toBe('todo');
  });
});
