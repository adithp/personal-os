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
    sql`truncate table notes, note_folders, entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
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

interface NoteItem {
  id: string;
  title: string;
  contentMd: string;
  revision: number;
  pinned: boolean;
  deletedAt: string | null;
  excerpt: string;
}
interface Written {
  item: NoteItem;
  undo: { action: string; input: Record<string, unknown> } | null;
}
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

const addNote = async (title: string, headers = alice, more: Record<string, unknown> = {}) =>
  (await call('POST', '/notes', headers, { title, ...more })).json<Written>();
const undo = (written: Written, headers = alice) => call('POST', '/undo', headers, written.undo);

describe('login is required on every notes route', () => {
  it.each([
    ['GET', '/notes'],
    ['GET', `/notes/${MISSING}`],
    ['POST', '/notes'],
    ['PATCH', `/notes/${MISSING}`],
    ['POST', `/notes/${MISSING}/rename`],
    ['DELETE', `/notes/${MISSING}`],
    ['DELETE', `/notes/${MISSING}/forever`],
    ['DELETE', '/notes/trash'],
  ])(
    '%s %s answers 401 with no token, a stranger token, or an expired one',
    async (method, url) => {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {};
      const none = await call(method as 'GET', url, {}, body);
      expect(none.statusCode).toBe(401);
      expect(none.json()).toMatchObject({ error: { code: 'unauthorized' } });
      const stranger = await keys.signWithUnknownKey({ sub: USER_ID });
      expect(
        (await call(method as 'GET', url, { authorization: `Bearer ${stranger}` }, body))
          .statusCode,
      ).toBe(401);
      const expired = await keys.sign({ sub: USER_ID, expiresIn: -60 });
      expect(
        (await call(method as 'GET', url, { authorization: `Bearer ${expired}` }, body)).statusCode,
      ).toBe(401);
    },
  );
});

describe('POST /notes and GET /notes', () => {
  it('answers 201 with { item, undo }; the list has { items } without the text', async () => {
    const response = await call('POST', '/notes', alice, { contentMd: 'Hello **world**' });
    expect(response.statusCode).toBe(201);
    const body = response.json<Written>();
    expect(body.item).toMatchObject({
      title: 'Untitled',
      revision: 1,
      contentMd: 'Hello **world**',
    });
    expect(body.undo).toMatchObject({ action: 'notes.delete' });

    const list = await call('GET', '/notes');
    expect(list.statusCode).toBe(200);
    const { items } = list.json<{ items: NoteItem[] }>();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Untitled', excerpt: 'Hello world' });
    expect(items[0]).not.toHaveProperty('contentMd');
  });

  it('undo moves the new note to the trash', async () => {
    const written = await addNote('A');
    expect((await undo(written)).statusCode).toBe(200);
    expect((await call('GET', '/notes')).json<{ items: unknown[] }>().items).toEqual([]);
    expect(
      (await call('GET', `/notes/${written.item.id}`)).json<{ item: NoteItem }>().item.deletedAt,
    ).not.toBeNull();
  });

  it('answers 400 for bad input and 409 for a taken title', async () => {
    const bad = await call('POST', '/notes', alice, { title: 'a|b' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect((await call('GET', '/notes?sort=size')).statusCode).toBe(400);
    expect((await call('GET', '/notes?sort=size')).statusCode).toBe(400);
    await addNote('Dup');
    const taken = await call('POST', '/notes', alice, { title: 'dup' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: { code: 'note_title_taken' } });
  });

  it('reads trash and limit from the query string', async () => {
    const first = await addNote('One');
    await addNote('Two');
    await call('DELETE', `/notes/${first.item.id}`);
    const trash = await call('GET', '/notes?trash=true');
    expect(trash.json<{ items: NoteItem[] }>().items.map((n) => n.title)).toEqual(['One']);
    const limited = await call('GET', '/notes?limit=1');
    expect(limited.json<{ items: unknown[] }>().items).toHaveLength(1);
  });

  it('sorts from the query string', async () => {
    await addNote('b');
    await addNote('a');
    const list = await call('GET', '/notes?sort=title');
    expect(list.json<{ items: NoteItem[] }>().items.map((n) => n.title)).toEqual(['a', 'b']);
  });
});

describe('GET /notes/:id', () => {
  it('returns { item } with the text; bad id is 400, unknown 404', async () => {
    const { item } = await addNote('A', alice, { contentMd: 'text' });
    const response = await call('GET', `/notes/${item.id}`);
    expect(response.json<{ item: NoteItem }>().item).toMatchObject({
      contentMd: 'text',
      revision: 1,
    });
    expect((await call('GET', '/notes/not-an-id')).statusCode).toBe(400);
    expect((await call('GET', `/notes/${MISSING}`)).statusCode).toBe(404);
  });
});

describe('PATCH /notes/:id', () => {
  it('saves with the revision, answers 409 note_conflict when old, and force keeps mine', async () => {
    const { item } = await addNote('A');
    const saved = await call('PATCH', `/notes/${item.id}`, alice, {
      baseRevision: 1,
      contentMd: 'one',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<Written>().item).toMatchObject({ revision: 2, contentMd: 'one' });
    const stale = await call('PATCH', `/notes/${item.id}`, alice, {
      baseRevision: 1,
      contentMd: 'two',
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: 'note_conflict' } });
    const forced = await call('PATCH', `/notes/${item.id}`, alice, {
      baseRevision: 1,
      contentMd: 'two',
      force: true,
    });
    expect(forced.json<Written>().item).toMatchObject({ revision: 3, contentMd: 'two' });
  });

  it('takes the id from the path, rejects empty changes, and the undo restores the text', async () => {
    const { item } = await addNote('A', alice, { contentMd: 'before' });
    expect((await call('PATCH', `/notes/${item.id}`, alice, { baseRevision: 1 })).statusCode).toBe(
      400,
    );
    const written = (
      await call('PATCH', `/notes/${item.id}`, alice, {
        id: MISSING,
        baseRevision: 1,
        contentMd: 'after',
      })
    ).json<Written>();
    expect(written.item.id).toBe(item.id);
    expect((await undo(written)).statusCode).toBe(200);
    const now = (await call('GET', `/notes/${item.id}`)).json<{ item: NoteItem }>().item;
    expect(now.contentMd).toBe('before');
  });
});

describe('POST /notes/:id/rename', () => {
  it('renames, answers 409 for a taken title, and the undo renames back', async () => {
    const { item } = await addNote('Old');
    await addNote('Taken');
    const renamed = await call('POST', `/notes/${item.id}/rename`, alice, { title: 'New' });
    expect(renamed.statusCode).toBe(200);
    const body = renamed.json<Written>();
    expect(body.item).toMatchObject({ title: 'New', revision: 2 });
    const taken = await call('POST', `/notes/${item.id}/rename`, alice, { title: 'taken' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: { code: 'note_title_taken' } });
    await undo(body);
    expect((await call('GET', `/notes/${item.id}`)).json<{ item: NoteItem }>().item.title).toBe(
      'Old',
    );
  });
});

describe('DELETE /notes/:id, /forever and /trash', () => {
  it('moves to the trash with an undo, purges only from the trash, and empties it', async () => {
    const a = await addNote('A');
    const b = await addNote('B');
    const deleted = await call('DELETE', `/notes/${a.item.id}`);
    expect(deleted.statusCode).toBe(200);
    const written = deleted.json<Written>();
    expect(written.undo).toMatchObject({ action: 'notes.restore' });
    expect((await call('DELETE', `/notes/${b.item.id}/forever`)).statusCode).toBe(400);
    expect((await undo(written)).statusCode).toBe(200);
    expect((await call('GET', '/notes')).json<{ items: unknown[] }>().items).toHaveLength(2);

    await call('DELETE', `/notes/${a.item.id}`);
    const purged = await call('DELETE', `/notes/${a.item.id}/forever`);
    expect(purged.statusCode).toBe(200);
    expect(purged.json()).toMatchObject({ undo: null });
    expect((await call('GET', `/notes/${a.item.id}`)).statusCode).toBe(404);

    await call('DELETE', `/notes/${b.item.id}`);
    const emptied = await call('DELETE', '/notes/trash');
    expect(emptied.json()).toMatchObject({ item: { deleted: 1 }, undo: null });
    expect((await call('GET', `/notes/${b.item.id}`)).statusCode).toBe(404);
  });
});

describe('user isolation', () => {
  it('another user gets 404 on every id route and still sees their own data intact', async () => {
    const { item } = await addNote('Private', alice, { contentMd: 'secret' });
    await call('DELETE', `/notes/${item.id}`);
    const live = (await addNote('Live', alice, { contentMd: 'x' })).item;
    expect((await call('GET', `/notes/${live.id}`, bob)).statusCode).toBe(404);
    expect(
      (await call('PATCH', `/notes/${live.id}`, bob, { baseRevision: 1, contentMd: 'hacked' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/notes/${live.id}/rename`, bob, { title: 'Mine' })).statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/notes/${live.id}`, bob)).statusCode).toBe(404);
    expect((await call('DELETE', `/notes/${item.id}/forever`, bob)).statusCode).toBe(404);
    expect((await call('DELETE', '/notes/trash', bob)).json()).toMatchObject({
      item: { deleted: 0 },
    });
    expect((await call('GET', '/notes', bob)).json<{ items: unknown[] }>().items).toEqual([]);
    expect((await call('GET', `/notes/${live.id}`)).json<{ item: NoteItem }>().item.contentMd).toBe(
      'x',
    );
    expect(
      (await call('GET', `/notes/${item.id}`)).json<{ item: NoteItem }>().item.deletedAt,
    ).not.toBeNull();
  });
});
