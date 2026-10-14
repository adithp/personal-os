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
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

interface Item {
  id: string;
  title: string;
}
const make = async (title: string, contentMd = '', headers = alice): Promise<Item> => {
  const response = await call('POST', '/notes', headers, { title, contentMd });
  return response.json<{ item: Item }>().item;
};
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

describe('GET /notes/titles', () => {
  it('answers 401 with no token, a stranger’s token and an expired token', async () => {
    expect((await call('GET', '/notes/titles', {})).statusCode).toBe(401);
    const stranger = await keys.signWithUnknownKey({ sub: USER_ID });
    expect(
      (await call('GET', '/notes/titles', { authorization: `Bearer ${stranger}` })).statusCode,
    ).toBe(401);
    const expired = await keys.sign({ sub: USER_ID, expiresIn: -60 });
    expect(
      (await call('GET', '/notes/titles', { authorization: `Bearer ${expired}` })).statusCode,
    ).toBe(401);
  });

  it('lists id and title of the user’s live notes ordered by title', async () => {
    await make('b note');
    await make('A note');
    await make('Bobs', '', bob);
    const response = await call('GET', '/notes/titles');
    expect(response.statusCode).toBe(200);
    const { items } = response.json<{ items: Item[] }>();
    expect(items.map((i) => i.title)).toEqual(['A note', 'b note']);
  });
});

describe('GET /notes/:id/links', () => {
  it('answers 401 with no token, a stranger’s token and an expired token', async () => {
    const note = await make('One');
    const url = `/notes/${note.id}/links`;
    expect((await call('GET', url, {})).statusCode).toBe(401);
    const stranger = await keys.signWithUnknownKey({ sub: USER_ID });
    expect((await call('GET', url, { authorization: `Bearer ${stranger}` })).statusCode).toBe(401);
    const expired = await keys.sign({ sub: USER_ID, expiresIn: -60 });
    expect((await call('GET', url, { authorization: `Bearer ${expired}` })).statusCode).toBe(401);
  });

  it('answers 400 for a bad id', async () => {
    const response = await call('GET', '/notes/nope/links');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('returns backlinks and outgoing links, and follows a rename', async () => {
    const target = await make('Target');
    const source = await make('Source', 'See [[Target]] and [[Nowhere]]');
    const back = (await call('GET', `/notes/${target.id}/links`)).json<{
      item: { backlinks: { noteId: string; context: string }[]; outgoing: unknown[] };
    }>();
    expect(back.item.backlinks).toEqual([
      { noteId: source.id, title: 'Source', context: 'See Target and Nowhere' },
    ]);
    const out = (await call('GET', `/notes/${source.id}/links`)).json<{
      item: { outgoing: unknown[] };
    }>();
    expect(out.item.outgoing).toEqual([
      { target: 'Target', noteId: target.id },
      { target: 'Nowhere', noteId: null },
    ]);

    const renamed = await call('POST', `/notes/${target.id}/rename`, alice, { title: 'Goal' });
    expect(renamed.json<{ item: { updatedNoteIds: string[] } }>().item.updatedNoteIds).toEqual([
      source.id,
    ]);
    const after = (await call('GET', `/notes/${source.id}`)).json<{
      item: { contentMd: string };
    }>();
    expect(after.item.contentMd).toBe('See [[Goal]] and [[Nowhere]]');
  });

  it('answers 404 for another user’s note and a missing note, and the owner still sees it', async () => {
    const mine = await make('Mine', 'x [[Other]]');
    expect((await call('GET', `/notes/${mine.id}/links`, bob)).statusCode).toBe(404);
    expect((await call('GET', `/notes/${MISSING}/links`)).statusCode).toBe(404);
    expect((await call('GET', `/notes/${mine.id}/links`)).statusCode).toBe(200);
  });
});
