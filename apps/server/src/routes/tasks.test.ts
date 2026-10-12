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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

interface Item {
  id: string;
  title: string;
  status: string;
  priority: number;
}
interface Written {
  item: Item;
  undo: { action: string; input: Record<string, unknown> } | null;
}

async function createTask(title: string, headers = alice, extra: object = {}) {
  const response = await call('POST', '/tasks', headers, { title, ...extra });
  return response.json<Written>();
}

describe('login is required on every task route', () => {
  const routes: [string, string][] = [
    ['GET', '/tasks'],
    ['GET', '/tasks/8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d'],
    ['POST', '/tasks'],
    ['PATCH', '/tasks/8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d'],
    ['POST', '/tasks/8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d/complete'],
    ['DELETE', '/tasks/8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d'],
    ['POST', '/tasks/8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d/archive'],
    ['POST', '/tasks/8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d/unarchive'],
    ['POST', '/undo'],
  ];

  it.each(routes)('%s %s answers 401 with no token', async (method, url) => {
    const response = await call(method as 'GET', url, {}, method === 'GET' ? undefined : {});
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('answers 401 for a token signed by a stranger or an expired one', async () => {
    const stranger = { authorization: `Bearer ${await keys.signWithUnknownKey()}` };
    const expired = { authorization: `Bearer ${await keys.sign({ expiresIn: -60 })}` };
    expect((await call('GET', '/tasks', stranger)).statusCode).toBe(401);
    expect((await call('GET', '/tasks', expired)).statusCode).toBe(401);
  });
});

describe('POST /tasks', () => {
  it('creates a task and answers 201 with the task and an undo', async () => {
    const response = await call('POST', '/tasks', alice, { title: 'Write report', priority: 2 });
    expect(response.statusCode).toBe(201);
    const body = response.json<Written>();
    expect(body.item).toMatchObject({ title: 'Write report', priority: 2, status: 'todo' });
    expect(body.undo).toEqual({ action: 'tasks.delete', input: { id: body.item.id } });
  });

  it('creates the tags named in tagNames and returns them', async () => {
    const response = await call('POST', '/tasks', alice, {
      title: 'x',
      tagNames: ['Home', 'home'],
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ item: { tags: { name: string }[] } }>();
    expect(body.item.tags.map((tag) => tag.name)).toEqual(['Home']);
  });

  it('answers 400 for a tag name with a space', async () => {
    const response = await call('POST', '/tasks', alice, { title: 'x', tagNames: ['a b'] });
    expect(response.statusCode).toBe(400);
  });

  it('answers 400 with the error format for bad input', async () => {
    for (const payload of [{}, { title: '' }, { title: 'x', priority: 9 }]) {
      const response = await call('POST', '/tasks', alice, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    }
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { ...alice, 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /tasks and /tasks/:id', () => {
  it('lists only the signed-in user’s tasks', async () => {
    await createTask('Alice 1');
    await createTask('Bob 1', bob);
    const response = await call('GET', '/tasks');
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: Item[] }>().items.map((task) => task.title)).toEqual(['Alice 1']);
  });

  it('filters and sorts from the query string', async () => {
    await createTask('b', alice, { status: 'doing' });
    await createTask('a', alice, { status: 'todo' });
    await createTask('c', alice, { status: 'done' });
    const filtered = await call('GET', '/tasks?status=doing&status=todo&sort=title');
    expect(filtered.json<{ items: Item[] }>().items.map((task) => task.title)).toEqual(['a', 'b']);
    const paged = await call('GET', '/tasks?sort=title&limit=1&offset=1');
    expect(paged.json<{ items: Item[] }>().items.map((task) => task.title)).toEqual(['b']);
  });

  it('answers 400 for a bad filter', async () => {
    expect((await call('GET', '/tasks?status=later')).statusCode).toBe(400);
    expect((await call('GET', '/tasks?limit=0')).statusCode).toBe(400);
  });

  it('gets one task, and 404 for another user’s, a missing, or a malformed id', async () => {
    const { item } = await createTask('Mine');
    const other = await createTask('Bobs', bob);
    expect((await call('GET', `/tasks/${item.id}`)).json()).toMatchObject({
      item: { title: 'Mine' },
    });
    const notYours = await call('GET', `/tasks/${other.item.id}`);
    expect(notYours.statusCode).toBe(404);
    expect(notYours.json()).toEqual({ error: { code: 'not_found', message: 'Task not found' } });
    expect((await call('GET', '/tasks/8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d')).statusCode).toBe(404);
    expect((await call('GET', '/tasks/not-an-id')).statusCode).toBe(400);
  });
});

describe('PATCH /tasks/:id', () => {
  it('changes the task and returns an undo', async () => {
    const { item } = await createTask('Before');
    const response = await call('PATCH', `/tasks/${item.id}`, alice, { title: 'After' });
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item.title).toBe('After');
    expect(body.undo).toEqual({ action: 'tasks.update', input: { id: item.id, title: 'Before' } });
  });

  it('uses the id from the path, not the body', async () => {
    const mine = await createTask('Mine');
    const bobs = await createTask('Bobs', bob);
    await call('PATCH', `/tasks/${mine.item.id}`, alice, { id: bobs.item.id, title: 'Changed' });
    const bobsNow = await call('GET', `/tasks/${bobs.item.id}`, bob);
    expect(bobsNow.json<{ item: Item }>().item.title).toBe('Bobs');
  });

  it('answers 404 for another user’s task and 400 for an empty change', async () => {
    const bobs = await createTask('Bobs', bob);
    expect((await call('PATCH', `/tasks/${bobs.item.id}`, alice, { title: 'x' })).statusCode).toBe(
      404,
    );
    const mine = await createTask('Mine');
    expect((await call('PATCH', `/tasks/${mine.item.id}`, alice, {})).statusCode).toBe(400);
  });
});

describe('POST /tasks/:id/complete', () => {
  it('marks the task done', async () => {
    const { item } = await createTask('x');
    const response = await call('POST', `/tasks/${item.id}/complete`);
    expect(response.statusCode).toBe(200);
    expect(response.json<Written>().item.status).toBe('done');
  });
});

describe('DELETE /tasks/:id and POST /undo', () => {
  it('deletes the task, and the returned undo brings it back', async () => {
    const { item } = await createTask('Delete me');
    const deleted = await call('DELETE', `/tasks/${item.id}`);
    expect(deleted.statusCode).toBe(200);
    const body = deleted.json<Written>();
    expect(body.undo).toEqual({ action: 'tasks.restore', input: { id: item.id } });
    expect((await call('GET', '/tasks')).json<{ items: Item[] }>().items).toEqual([]);

    const undone = await call('POST', '/undo', alice, body.undo);
    expect(undone.statusCode).toBe(200);
    expect((await call('GET', '/tasks')).json<{ items: Item[] }>().items).toHaveLength(1);
  });

  it('undoes a creation, an edit, and a completion', async () => {
    const created = await createTask('x');
    expect((await call('POST', '/undo', alice, created.undo)).statusCode).toBe(200);
    expect((await call('GET', '/tasks')).json<{ items: Item[] }>().items).toEqual([]);

    const task = (await createTask('Original')).item;
    const edit = (
      await call('PATCH', `/tasks/${task.id}`, alice, { title: 'Edited' })
    ).json<Written>();
    await call('POST', '/undo', alice, edit.undo);
    expect((await call('GET', `/tasks/${task.id}`)).json<{ item: Item }>().item.title).toBe(
      'Original',
    );

    const done = (await call('POST', `/tasks/${task.id}/complete`)).json<Written>();
    await call('POST', '/undo', alice, done.undo);
    expect((await call('GET', `/tasks/${task.id}`)).json<{ item: Item }>().item.status).toBe(
      'todo',
    );
  });

  it('cannot delete or undo on another user’s task', async () => {
    const bobs = await createTask('Bobs', bob);
    expect((await call('DELETE', `/tasks/${bobs.item.id}`)).statusCode).toBe(404);
    const undo = { action: 'tasks.delete', input: { id: bobs.item.id } };
    expect((await call('POST', '/undo', alice, undo)).statusCode).toBe(404);
    expect((await call('GET', `/tasks/${bobs.item.id}`, bob)).statusCode).toBe(200);
  });

  it('refuses to “undo” with a read action or an unknown one', async () => {
    for (const action of ['tasks.list', 'tasks.get', 'tasks.explode']) {
      const response = await call('POST', '/undo', alice, { action, input: {} });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'cannot_undo' } });
    }
  });

  it('checks the undo input like any other call', async () => {
    const response = await call('POST', '/undo', alice, {
      action: 'tasks.update',
      input: { id: 'nope' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('archive, tags, and subtasks over HTTP', () => {
  it('archives and unarchives, with undo, and filters the list', async () => {
    const { item } = await createTask('x');
    const archived = await call('POST', `/tasks/${item.id}/archive`);
    expect(archived.statusCode).toBe(200);
    const body = archived.json<Written & { item: { archivedAt: string | null } }>();
    expect(body.item.archivedAt).not.toBeNull();
    expect(body.undo).toEqual({ action: 'tasks.unarchive', input: { id: item.id } });
    expect((await call('GET', '/tasks')).json<{ items: Item[] }>().items).toEqual([]);
    expect(
      (await call('GET', '/tasks?archived=true')).json<{ items: Item[] }>().items,
    ).toHaveLength(1);

    await call('POST', '/undo', alice, body.undo);
    expect((await call('GET', '/tasks')).json<{ items: Item[] }>().items).toHaveLength(1);
    const back = await call('POST', `/tasks/${item.id}/unarchive`);
    expect(back.statusCode).toBe(200);
    expect(back.json<Written>().undo).toBeNull();
  });

  it('archive answers 404 for another user’s task and 400 for a bad id', async () => {
    const bobs = await createTask('Bobs', bob);
    expect((await call('POST', `/tasks/${bobs.item.id}/archive`)).statusCode).toBe(404);
    expect((await call('POST', `/tasks/${bobs.item.id}/unarchive`)).statusCode).toBe(404);
    expect((await call('POST', '/tasks/nope/archive')).statusCode).toBe(400);
  });

  it('creates a task with tags and a subtask, and filters from the query string', async () => {
    const tagResponse = await call('POST', '/tags', alice, { name: 'work' });
    const tagId = tagResponse.json<{ item: { id: string } }>().item.id;
    const parent = await createTask('parent', alice, { tagIds: [tagId] });
    await createTask('child', alice, { parentTaskId: parent.item.id, priority: 1 });
    const top = (await call('GET', '/tasks')).json<{
      items: (Item & { tags: { name: string }[]; subtaskCount: number })[];
    }>().items;
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ subtaskCount: 1, tags: [{ name: 'work' }] });
    const children = await call('GET', `/tasks?parent=${parent.item.id}`);
    expect(children.json<{ items: Item[] }>().items.map((task) => task.title)).toEqual(['child']);
    const tagged = await call('GET', `/tasks?tagId=${tagId}&priority=4`);
    expect(tagged.json<{ items: Item[] }>().items).toHaveLength(1);
  });

  it('answers 404 for another user’s tag and 400 for a subtask of a subtask', async () => {
    const bobsTag = (await call('POST', '/tags', bob, { name: 'secret' })).json<{
      item: { id: string };
    }>().item.id;
    const refused = await call('POST', '/tasks', alice, { title: 'x', tagIds: [bobsTag] });
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual({ error: { code: 'not_found', message: 'Tag not found' } });
    const parent = await createTask('p');
    const child = await createTask('c', alice, { parentTaskId: parent.item.id });
    const deep = await call('POST', '/tasks', alice, { title: 'd', parentTaskId: child.item.id });
    expect(deep.statusCode).toBe(400);
    expect(deep.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('keeps all-day dates and refuses all-day without a date', async () => {
    const ok = await call('POST', '/tasks', alice, {
      title: 'x',
      dueAt: '2025-10-06T18:30:00.000Z',
      dueAllDay: true,
    });
    expect(ok.json<{ item: { dueAllDay: boolean } }>().item.dueAllDay).toBe(true);
    const bad = await createTask('y');
    const patched = await call('PATCH', `/tasks/${bad.item.id}`, alice, { dueAllDay: true });
    expect(patched.statusCode).toBe(400);
  });
});

describe('without a database', () => {
  it('only /health and /me exist', async () => {
    const bare = buildApp({ env, verifier: keys.verifier });
    const response = await bare.inject({ method: 'GET', url: '/api/v1/tasks', headers: alice });
    expect(response.statusCode).toBe(404);
    await bare.close();
  });
});
