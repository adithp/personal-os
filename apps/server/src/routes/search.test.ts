import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { searchResultSchema } from '@personal-os/shared';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadEnv } from '../config/env';
import { SCHEMA_BEHIND_MESSAGE, type SchemaGuard } from '../lib/schema-guard';
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

const post = (body: unknown, headers: Record<string, string> = alice, target = app) =>
  target.inject({ method: 'POST', url: '/api/v1/search', headers, payload: body as object });
const createTask = (title: string, headers = alice) =>
  app.inject({ method: 'POST', url: '/api/v1/tasks', headers, payload: { title } });
const createTag = (name: string) =>
  app.inject({ method: 'POST', url: '/api/v1/tags', headers: alice, payload: { name } });

describe('POST /search', () => {
  it('answers 401 with no token, a stranger token, or an expired one', async () => {
    expect((await post({ q: 'rent' }, {})).statusCode).toBe(401);
    const stranger = { authorization: `Bearer ${await keys.signWithUnknownKey()}` };
    expect((await post({ q: 'rent' }, stranger)).statusCode).toBe(401);
    const expired = {
      authorization: `Bearer ${await keys.sign({ sub: USER_ID, expiresIn: -60 })}`,
    };
    expect((await post({ q: 'rent' }, expired)).statusCode).toBe(401);
  });

  it('answers 400 validation_error for an empty, blank or too long text and a bad type or limit', async () => {
    const bad = [
      {},
      { q: '' },
      { q: '   ' },
      { q: 'a'.repeat(101) },
      { q: 'rent', types: ['note'] },
      { q: 'rent', limit: 0 },
      { q: 'rent', limit: 21 },
    ];
    for (const body of bad) {
      const response = await post(body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    }
  });

  it('answers { item: { q, groups } } with tasks and tags', async () => {
    await createTask('Pay rent');
    await createTag('rentals');
    const response = await post({ q: 'rent' });
    expect(response.statusCode).toBe(200);
    const { item } = response.json<{ item: unknown }>();
    const parsed = searchResultSchema.parse(item);
    expect(parsed.q).toBe('rent');
    expect(parsed.groups.map((group) => group.type)).toEqual(['task', 'tag']);
    expect(parsed.groups[0]?.items[0]).toMatchObject({ title: 'Pay rent', archived: false });
  });

  it('honours types and limit', async () => {
    for (const title of ['rent 1', 'rent 2', 'rent 3']) await createTask(title);
    await createTag('rentals');
    const only = searchResultSchema.parse(
      (await post({ q: 'rent', types: ['task'], limit: 2 })).json<{ item: unknown }>().item,
    );
    expect(only.groups.map((group) => group.type)).toEqual(['task']);
    expect(only.groups[0]?.items).toHaveLength(2);
  });

  it('never shows another user’s items, and they still see their own', async () => {
    await createTask('Pay rent');
    const mine = (await post({ q: 'rent' }, alice)).json<{ item: { groups: unknown[] } }>();
    const theirs = (await post({ q: 'rent' }, bob)).json<{ item: { groups: unknown[] } }>();
    expect(mine.item.groups).toHaveLength(1);
    expect(theirs.item.groups).toEqual([]);
  });

  it('answers 503 schema_behind while the migration is missing', async () => {
    const guard: SchemaGuard = {
      check: () => Promise.resolve({ behind: true, missing: ['0010_tasks_search_vector.sql'] }),
    };
    const behind = buildApp({ env, verifier: keys.verifier, db: t.db, schemaGuard: guard });
    await t.db.execute(sql`alter table entities rename column search_vector to old_search_vector`);
    try {
      const response = await post({ q: 'rent' }, alice, behind);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: { code: 'schema_behind', message: SCHEMA_BEHIND_MESSAGE },
      });
    } finally {
      await t.db.execute(
        sql`alter table entities rename column old_search_vector to search_vector`,
      );
      await behind.close();
    }
  });
});
