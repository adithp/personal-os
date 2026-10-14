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
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

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
    sql`truncate table notes, note_versions, note_folders, entity_tags, tags, links, tasks, entities, auth.users cascade`,
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
  revision?: number;
  contentMd?: string;
}

/** A note holding "new" with one stored version ("old"). */
async function noteWithVersion() {
  const created = (await call('POST', '/notes', alice, { title: 'Doc', contentMd: 'old' })).json<{
    item: Item;
  }>().item;
  await call('PATCH', `/notes/${created.id}`, alice, {
    baseRevision: created.revision,
    contentMd: 'new',
  });
  const list = (await call('GET', `/notes/${created.id}/versions`)).json<{ items: Item[] }>();
  return { noteId: created.id, versionId: list.items[0]?.id ?? '' };
}

describe('version history routes', () => {
  it('answer 401 without a valid token', async () => {
    const { noteId, versionId } = await noteWithVersion();
    const urls: ['GET' | 'POST', string][] = [
      ['GET', `/notes/${noteId}/versions`],
      ['GET', `/notes/${noteId}/versions/${versionId}`],
      ['POST', `/notes/${noteId}/restore/${versionId}`],
    ];
    const stranger = {
      authorization: `Bearer ${await keys.signWithUnknownKey({ sub: USER_ID })}`,
    };
    const expired = {
      authorization: `Bearer ${await keys.sign({ sub: USER_ID, expiresIn: -60 })}`,
    };
    for (const [method, url] of urls) {
      for (const headers of [{}, stranger, expired]) {
        expect((await call(method, url, headers)).statusCode).toBe(401);
      }
    }
  });

  it('answer 400 for ids that are not uuids', async () => {
    expect((await call('GET', '/notes/x/versions')).statusCode).toBe(400);
    expect((await call('GET', `/notes/${MISSING}/versions/x`)).statusCode).toBe(400);
    expect((await call('POST', `/notes/${MISSING}/restore/x`)).statusCode).toBe(400);
  });

  it('list, read, restore and undo a version', async () => {
    const { noteId, versionId } = await noteWithVersion();
    const list = await call('GET', `/notes/${noteId}/versions`);
    expect(list.statusCode).toBe(200);
    expect(list.json<{ items: { reason: string; words: number }[] }>().items[0]).toMatchObject({
      reason: 'auto',
      words: 1,
    });

    const one = await call('GET', `/notes/${noteId}/versions/${versionId}`);
    expect(one.json<{ item: Item }>().item.contentMd).toBe('old');

    const restored = await call('POST', `/notes/${noteId}/restore/${versionId}`);
    expect(restored.statusCode).toBe(200);
    const body = restored.json<{
      item: Item;
      undo: { action: string; input: { id: string; versionId: string } };
    }>();
    expect(body.item.contentMd).toBe('old');
    expect(body.undo.action).toBe('notes.restoreVersion');
    const undone = await call(
      'POST',
      `/notes/${body.undo.input.id}/restore/${body.undo.input.versionId}`,
    );
    expect(undone.json<{ item: Item }>().item.contentMd).toBe('new');
  });

  it('answer 404 for another user and for missing ids', async () => {
    const { noteId, versionId } = await noteWithVersion();
    expect((await call('GET', `/notes/${noteId}/versions`, bob)).statusCode).toBe(404);
    expect((await call('GET', `/notes/${noteId}/versions/${versionId}`, bob)).statusCode).toBe(404);
    expect((await call('POST', `/notes/${noteId}/restore/${versionId}`, bob)).statusCode).toBe(404);
    expect((await call('GET', `/notes/${MISSING}/versions`)).statusCode).toBe(404);
    expect((await call('GET', `/notes/${noteId}/versions/${MISSING}`)).statusCode).toBe(404);
    expect((await call('POST', `/notes/${noteId}/restore/${MISSING}`)).statusCode).toBe(404);
    const mine = await call('GET', `/notes/${noteId}/versions`);
    expect(mine.json<{ items: unknown[] }>().items).toHaveLength(1);
  });
});
