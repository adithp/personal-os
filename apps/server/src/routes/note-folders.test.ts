import { entities, notes } from '@personal-os/db';
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
  await t.db.execute(sql`truncate table notes, note_folders, entities, auth.users cascade`);
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

interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  noteCount: number;
}
interface Written {
  item: FolderItem;
  undo: { action: string; input: Record<string, unknown> } | null;
}

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

const add = async (name: string, parentId: string | null = null, headers = alice) =>
  (await call('POST', '/note-folders', headers, { name, parentId })).json<Written>();
const names = async (headers = alice) =>
  (await call('GET', '/note-folders', headers))
    .json<{ items: FolderItem[] }>()
    .items.map((item) => item.name);

describe('login is required on every note folder route', () => {
  it.each([
    ['GET', '/note-folders'],
    ['POST', '/note-folders'],
    ['PATCH', `/note-folders/${MISSING}`],
    ['DELETE', `/note-folders/${MISSING}`],
  ])(
    '%s %s answers 401 with no token, a stranger token, and an expired token',
    async (method, url) => {
      const body = method === 'GET' ? undefined : {};
      const none = await call(method as 'GET', url, {}, body);
      expect(none.statusCode).toBe(401);
      expect(none.json()).toMatchObject({ error: { code: 'unauthorized' } });
      const stranger = await call(
        method as 'GET',
        url,
        {
          authorization: `Bearer ${await keys.signWithUnknownKey({ sub: USER_ID })}`,
        },
        body,
      );
      expect(stranger.statusCode).toBe(401);
      const expired = await call(
        method as 'GET',
        url,
        {
          authorization: `Bearer ${await keys.sign({ sub: USER_ID, expiresIn: -60 })}`,
        },
        body,
      );
      expect(expired.statusCode).toBe(401);
    },
  );
});

describe('GET /note-folders', () => {
  it('lists only the signed-in user folders with note counts', async () => {
    const mine = await add('Mine');
    await add('Bobs', null, bob);
    const [entity] = await t.db
      .insert(entities)
      .values({ userId: USER_ID, type: 'note', title: 'N' })
      .returning();
    await t.db
      .insert(notes)
      .values({ id: entity?.id, userId: USER_ID, title: 'N', folderId: mine.item.id });
    const response = await call('GET', '/note-folders');
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: FolderItem[] }>().items).toMatchObject([
      { name: 'Mine', parentId: null, noteCount: 1 },
    ]);
  });
});

describe('POST /note-folders', () => {
  it('answers 201 with the item and an undo that removes it', async () => {
    const response = await call('POST', '/note-folders', alice, { name: 'Work' });
    expect(response.statusCode).toBe(201);
    const body = response.json<Written>();
    expect(body.item).toMatchObject({ name: 'Work', parentId: null, noteCount: 0 });
    const undo = await call('POST', '/undo', alice, body.undo);
    expect(undo.statusCode).toBe(200);
    expect(await names()).toEqual([]);
  });

  it('answers 400 for invalid input', async () => {
    for (const payload of [{}, { name: '' }, { name: 'a/b' }, { name: 'A', parentId: 'nope' }]) {
      const response = await call('POST', '/note-folders', alice, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    }
  });

  it('answers 409 folder_name_taken for a duplicate ignoring case', async () => {
    await add('Work');
    const response = await call('POST', '/note-folders', alice, { name: 'work' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'folder_name_taken' } });
  });

  it('answers 400 folder_too_deep on the fourth level', async () => {
    const a = await add('A');
    const b = await add('B', a.item.id);
    const c = await add('C', b.item.id);
    const response = await call('POST', '/note-folders', alice, { name: 'D', parentId: c.item.id });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'folder_too_deep' } });
  });

  it('answers 404 for another user parent', async () => {
    const a = await add('A');
    const response = await call('POST', '/note-folders', bob, { name: 'X', parentId: a.item.id });
    expect(response.statusCode).toBe(404);
  });
});

describe('PATCH /note-folders/:id', () => {
  it('renames and the undo puts the name back', async () => {
    const a = await add('A');
    const response = await call('PATCH', `/note-folders/${a.item.id}`, alice, { name: 'Alpha' });
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item.name).toBe('Alpha');
    await call('POST', '/undo', alice, body.undo);
    expect(await names()).toEqual(['A']);
  });

  it('takes the id from the path, not the body', async () => {
    const a = await add('A');
    const b = await add('B');
    await call('PATCH', `/note-folders/${a.item.id}`, alice, { id: b.item.id, name: 'Renamed' });
    expect((await names()).sort()).toEqual(['B', 'Renamed']);
  });

  it('answers 400 for an empty body or a bad id, 404 for missing and foreign folders', async () => {
    const a = await add('A');
    expect((await call('PATCH', `/note-folders/${a.item.id}`, alice, {})).statusCode).toBe(400);
    expect((await call('PATCH', '/note-folders/not-an-id', alice, { name: 'X' })).statusCode).toBe(
      400,
    );
    expect((await call('PATCH', `/note-folders/${MISSING}`, alice, { name: 'X' })).statusCode).toBe(
      404,
    );
    expect((await call('PATCH', `/note-folders/${a.item.id}`, bob, { name: 'X' })).statusCode).toBe(
      404,
    );
    expect(await names()).toEqual(['A']);
  });

  it('answers 400 for a move into its own descendant and 409 for a name clash', async () => {
    const a = await add('A');
    const b = await add('B', a.item.id);
    const cycle = await call('PATCH', `/note-folders/${a.item.id}`, alice, { parentId: b.item.id });
    expect(cycle.statusCode).toBe(400);
    const other = await add('B');
    const clash = await call('PATCH', `/note-folders/${other.item.id}`, alice, {
      parentId: a.item.id,
    });
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toMatchObject({ error: { code: 'folder_name_taken' } });
  });
});

describe('DELETE /note-folders/:id', () => {
  it('soft deletes and the undo restores it', async () => {
    const a = await add('A');
    const response = await call('DELETE', `/note-folders/${a.item.id}`);
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(await names()).toEqual([]);
    expect((await call('POST', '/undo', alice, body.undo)).statusCode).toBe(200);
    expect(await names()).toEqual(['A']);
  });

  it('answers 409 folder_not_empty with a message for a folder with notes', async () => {
    const a = await add('A');
    for (const title of ['N1', 'N2']) {
      const [entity] = await t.db
        .insert(entities)
        .values({ userId: USER_ID, type: 'note', title })
        .returning();
      await t.db
        .insert(notes)
        .values({ id: entity?.id, userId: USER_ID, title, folderId: a.item.id });
    }
    const response = await call('DELETE', `/note-folders/${a.item.id}`);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'folder_not_empty',
        message: 'Move or delete the 2 notes in this folder first.',
      },
    });
  });

  it('answers 404 for a missing folder or another user folder, which stays visible', async () => {
    const a = await add('A');
    expect((await call('DELETE', `/note-folders/${MISSING}`)).statusCode).toBe(404);
    expect((await call('DELETE', `/note-folders/${a.item.id}`, bob)).statusCode).toBe(404);
    expect((await call('DELETE', '/note-folders/not-an-id')).statusCode).toBe(400);
    expect(await names()).toEqual(['A']);
  });
});
