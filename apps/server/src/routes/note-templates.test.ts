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
  await t.db.execute(sql`truncate table notes, note_templates, entities, auth.users cascade`);
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

interface Item {
  id: string;
  name: string;
  contentMd: string;
  isDailyDefault: boolean;
  dailyDate?: string | null;
  title?: string;
}
interface Written {
  item: Item;
  undo: { action: string; input: Record<string, unknown> } | null;
}

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

const add = async (name: string, extra: Record<string, unknown> = {}, headers = alice) =>
  (await call('POST', '/note-templates', headers, { name, ...extra })).json<Written>();

describe('login is required', () => {
  it.each([
    ['GET', '/note-templates'],
    ['POST', '/note-templates'],
    ['PATCH', `/note-templates/${MISSING}`],
    ['POST', `/note-templates/${MISSING}/restore`],
    ['DELETE', `/note-templates/${MISSING}`],
    ['POST', '/notes/daily'],
  ])(
    '%s %s answers 401 with no token, a stranger token, and an expired token',
    async (method, url) => {
      const body = method === 'GET' ? undefined : {};
      expect((await call(method as 'GET', url, {}, body)).statusCode).toBe(401);
      const stranger = {
        authorization: `Bearer ${await keys.signWithUnknownKey({ sub: USER_ID })}`,
      };
      expect((await call(method as 'GET', url, stranger, body)).statusCode).toBe(401);
      const expired = {
        authorization: `Bearer ${await keys.sign({ sub: USER_ID, expiresIn: -60 })}`,
      };
      expect((await call(method as 'GET', url, expired, body)).statusCode).toBe(401);
    },
  );
});

describe('/note-templates', () => {
  it('creates (201), lists by name, updates, deletes and restores', async () => {
    const created = await call('POST', '/note-templates', alice, { name: 'B', contentMd: 'x' });
    expect(created.statusCode).toBe(201);
    await add('A');
    const listed = await call('GET', '/note-templates');
    expect(listed.json<{ items: Item[] }>().items.map((item) => item.name)).toEqual(['A', 'B']);

    const id = created.json<Written>().item.id;
    const updated = await call('PATCH', `/note-templates/${id}`, alice, { name: 'C' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Written>().item.name).toBe('C');

    const deleted = await call('DELETE', `/note-templates/${id}`);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json<Written>().undo?.action).toBe('noteTemplates.restore');
    const restored = await call('POST', `/note-templates/${id}/restore`);
    expect(restored.json<Written>().item.name).toBe('C');
  });

  it('answers 400 for bad input and a bad id', async () => {
    expect((await call('POST', '/note-templates', alice, { name: '' })).statusCode).toBe(400);
    expect((await call('PATCH', '/note-templates/nope', alice, { name: 'x' })).statusCode).toBe(
      400,
    );
    const a = await add('A');
    expect((await call('PATCH', `/note-templates/${a.item.id}`, alice, {})).statusCode).toBe(400);
  });

  it('answers 409 template_name_taken for a repeated name', async () => {
    await add('A');
    const response = await call('POST', '/note-templates', alice, { name: 'a' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'template_name_taken' } });
  });

  it('answers 404 for another user and keeps the data', async () => {
    const a = await add('A');
    expect(
      (await call('PATCH', `/note-templates/${a.item.id}`, bob, { name: 'X' })).statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/note-templates/${a.item.id}`, bob)).statusCode).toBe(404);
    expect((await call('POST', `/note-templates/${a.item.id}/restore`, bob)).statusCode).toBe(404);
    expect(
      (await call('PATCH', `/note-templates/${MISSING}`, alice, { name: 'X' })).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/note-templates', bob)).json<{ items: Item[] }>().items,
    ).toHaveLength(0);
    expect(
      (await call('GET', '/note-templates', alice)).json<{ items: Item[] }>().items,
    ).toHaveLength(1);
  });
});

describe('POST /notes/daily', () => {
  it('is not read as a note id, creates the day and returns it again', async () => {
    await add('Daily', { contentMd: 'Day {{title}}', isDailyDefault: true });
    const first = await call('POST', '/notes/daily', alice, { date: '2026-10-14' });
    expect(first.statusCode).toBe(200);
    expect(first.json<Written>().item).toMatchObject({
      title: '2026-10-14',
      dailyDate: '2026-10-14',
      contentMd: 'Day 2026-10-14',
    });
    expect(first.json<Written>().undo?.action).toBe('notes.delete');
    const second = await call('POST', '/notes/daily', alice, { date: '2026-10-14' });
    expect(second.json<Written>().item.id).toBe(first.json<Written>().item.id);
    expect(second.json<Written>().undo).toBeNull();
  });

  it('works without a body and answers 400 for a bad date', async () => {
    expect((await call('POST', '/notes/daily', alice, {})).statusCode).toBe(200);
    const bad = await call('POST', '/notes/daily', alice, { date: '2026-13-01' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('gives each user their own daily note', async () => {
    const a = await call('POST', '/notes/daily', alice, { date: '2026-10-14' });
    const b = await call('POST', '/notes/daily', bob, { date: '2026-10-14' });
    expect(b.json<Written>().item.id).not.toBe(a.json<Written>().item.id);
  });
});
