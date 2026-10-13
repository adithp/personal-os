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
    sql`truncate table goals, entity_tags, tags, links, tasks, entities, auth.users cascade`,
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

interface GoalItem {
  id: string;
  title: string;
  description: string | null;
  targetAt: string | null;
  status: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: { done: number; total: number };
}
interface Written {
  item: GoalItem;
  undo: { action: string; input: Record<string, unknown> } | null;
}

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

const addGoal = async (title: string, headers = alice, more: Record<string, unknown> = {}) =>
  (await call('POST', '/goals', headers, { title, ...more })).json<Written>();
const addTask = async (title: string, headers = alice, more: Record<string, unknown> = {}) =>
  (await call('POST', '/tasks', headers, { title, ...more })).json<{ item: { id: string } }>().item;
const getGoal = async (id: string, headers = alice) =>
  (await call('GET', `/goals/${id}`, headers)).json<{ item: GoalItem }>().item;
const undo = async (written: Written, headers = alice) =>
  await call('POST', '/undo', headers, written.undo);

describe('login is required on every goal route', () => {
  it.each([
    ['GET', '/goals'],
    ['GET', `/goals/${MISSING}`],
    ['POST', '/goals'],
    ['PATCH', `/goals/${MISSING}`],
    ['POST', `/goals/${MISSING}/status`],
    ['DELETE', `/goals/${MISSING}`],
    ['PUT', `/tasks/${MISSING}/goal`],
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

describe('POST /goals', () => {
  it('answers 201 with { item, undo } and the undo removes the goal', async () => {
    const response = await call('POST', '/goals', alice, {
      title: 'Learn Rust',
      targetAt: '2026-12-31T10:00:00.000Z',
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<Written>();
    expect(body.item).toMatchObject({
      title: 'Learn Rust',
      status: 'active',
      targetAt: '2026-12-30T18:30:00.000Z',
      progress: { done: 0, total: 0 },
    });
    expect(body.undo).toEqual({ action: 'goals.delete', input: { id: body.item.id } });
    expect((await undo(body)).statusCode).toBe(200);
    expect((await call('GET', `/goals/${body.item.id}`)).statusCode).toBe(404);
  });

  it('answers 400 for an empty title or a bad date', async () => {
    for (const payload of [{ title: '' }, { title: 'X', targetAt: 'tomorrow' }, {}]) {
      const response = await call('POST', '/goals', alice, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    }
  });
});

describe('GET /goals and GET /goals/:id', () => {
  it('lists { items } of the signed-in user only, filtered by status', async () => {
    const mine = await addGoal('Mine');
    const closed = await addGoal('Closed');
    await addGoal('Bobs', bob);
    await call('POST', `/goals/${closed.item.id}/status`, alice, { status: 'achieved' });
    const all = (await call('GET', '/goals')).json<{ items: GoalItem[] }>();
    expect(all.items.map((goal) => goal.title)).toEqual(['Mine', 'Closed']);
    const achieved = await call('GET', '/goals?status=achieved');
    expect(achieved.json<{ items: GoalItem[] }>().items.map((goal) => goal.id)).toEqual([
      closed.item.id,
    ]);
    expect((await call('GET', '/goals?status=nope')).statusCode).toBe(400);
    expect(mine.item.id).toBeTruthy();
  });

  it('gets one goal as { item } and answers 404 for missing and other users goals', async () => {
    const goal = await addGoal('G');
    const response = await call('GET', `/goals/${goal.item.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json<{ item: GoalItem }>().item).toEqual(goal.item);
    expect((await call('GET', `/goals/${MISSING}`)).statusCode).toBe(404);
    expect((await call('GET', `/goals/${goal.item.id}`, bob)).statusCode).toBe(404);
    expect((await call('GET', '/goals/not-an-id')).statusCode).toBe(400);
  });
});

describe('PATCH /goals/:id', () => {
  it('changes the goal and undoes it', async () => {
    const goal = await addGoal('Old');
    const response = await call('PATCH', `/goals/${goal.item.id}`, alice, {
      title: 'New',
      description: 'Notes',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item).toMatchObject({ title: 'New', description: 'Notes' });
    await undo(body);
    expect(await getGoal(goal.item.id)).toMatchObject({ title: 'Old', description: null });
  });

  it('takes the id from the path, answers 400 for an empty change and 404 for others', async () => {
    const goal = await addGoal('G');
    const sneaky = await call('PATCH', `/goals/${goal.item.id}`, alice, {
      id: MISSING,
      title: 'Changed',
    });
    expect(sneaky.json<Written>().item.id).toBe(goal.item.id);
    expect((await call('PATCH', `/goals/${goal.item.id}`, alice, {})).statusCode).toBe(400);
    expect((await call('PATCH', `/goals/${goal.item.id}`, bob, { title: 'X' })).statusCode).toBe(
      404,
    );
    expect((await getGoal(goal.item.id)).title).toBe('Changed');
  });
});

describe('POST /goals/:id/status', () => {
  it('sets the status with closedAt and the undo puts it back', async () => {
    const goal = await addGoal('G');
    const response = await call('POST', `/goals/${goal.item.id}/status`, alice, {
      status: 'dropped',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.item.status).toBe('dropped');
    expect(body.item.closedAt).not.toBeNull();
    await undo(body);
    expect(await getGoal(goal.item.id)).toMatchObject({ status: 'active', closedAt: null });
  });

  it('returns undo null for the same status, 400 for a bad status, 404 for others', async () => {
    const goal = await addGoal('G');
    const same = await call('POST', `/goals/${goal.item.id}/status`, alice, { status: 'active' });
    expect(same.statusCode).toBe(200);
    expect(same.json<Written>().undo).toBeNull();
    expect(
      (await call('POST', `/goals/${goal.item.id}/status`, alice, { status: 'done' })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/goals/${goal.item.id}/status`, bob, { status: 'dropped' })).statusCode,
    ).toBe(404);
  });
});

describe('DELETE /goals/:id', () => {
  it('deletes the goal and the undo brings it back with its tasks', async () => {
    const goal = await addGoal('G');
    const task = await addTask('T', alice, { goalId: goal.item.id });
    const response = await call('DELETE', `/goals/${goal.item.id}`);
    expect(response.statusCode).toBe(200);
    const body = response.json<Written>();
    expect(body.undo).toEqual({ action: 'goals.restore', input: { id: goal.item.id } });
    expect((await call('GET', `/goals/${goal.item.id}`)).statusCode).toBe(404);
    expect((await call('GET', '/goals')).json<{ items: unknown[] }>().items).toEqual([]);
    expect((await undo(body)).statusCode).toBe(200);
    expect((await getGoal(goal.item.id)).progress).toEqual({ done: 0, total: 1 });
    const tasks = await call('GET', `/tasks?goalId=${goal.item.id}`);
    expect(tasks.json<{ items: { id: string }[] }>().items.map((x) => x.id)).toEqual([task.id]);
  });

  it('answers 404 for a missing goal, another user goal, and a second delete', async () => {
    const goal = await addGoal('G');
    expect((await call('DELETE', `/goals/${MISSING}`)).statusCode).toBe(404);
    expect((await call('DELETE', `/goals/${goal.item.id}`, bob)).statusCode).toBe(404);
    expect((await getGoal(goal.item.id)).id).toBe(goal.item.id);
    await call('DELETE', `/goals/${goal.item.id}`);
    expect((await call('DELETE', `/goals/${goal.item.id}`)).statusCode).toBe(404);
  });
});

describe('PUT /tasks/:id/goal', () => {
  const putGoal = (taskId: string, goalId: string | null, headers = alice) =>
    call('PUT', `/tasks/${taskId}/goal`, headers, { goalId });

  it('links, moves, unlinks, and every undo round trips', async () => {
    const one = await addGoal('One');
    const two = await addGoal('Two');
    const task = await addTask('T');

    const linked = await putGoal(task.id, one.item.id);
    expect(linked.statusCode).toBe(200);
    expect(linked.json<Written>().item).toMatchObject({
      id: one.item.id,
      progress: { done: 0, total: 1 },
    });
    expect(linked.json<Written>().undo?.input).toEqual({ taskId: task.id, goalId: null });

    const moved = (await putGoal(task.id, two.item.id)).json<Written>();
    expect(moved.item.id).toBe(two.item.id);
    expect((await getGoal(one.item.id)).progress.total).toBe(0);
    await undo(moved);
    expect((await getGoal(one.item.id)).progress.total).toBe(1);
    expect((await getGoal(two.item.id)).progress.total).toBe(0);

    const out = (await putGoal(task.id, null)).json<Written>();
    expect(out.item.id).toBe(one.item.id);
    expect((await getGoal(one.item.id)).progress.total).toBe(0);
    await undo(out);
    expect((await getGoal(one.item.id)).progress.total).toBe(1);

    const task2 = (await call('GET', `/tasks/${task.id}`)).json<{
      item: { goal: { id: string; title: string } | null };
    }>();
    expect(task2.item.goal).toEqual({ id: one.item.id, title: 'One' });
  });

  it('returns undo null when the task is already in the goal', async () => {
    const goal = await addGoal('G');
    const task = await addTask('T', alice, { goalId: goal.item.id });
    const response = await putGoal(task.id, goal.item.id);
    expect(response.statusCode).toBe(200);
    expect(response.json<Written>().undo).toBeNull();
  });

  it('answers 400 for a subtask or a bad body, 404 for unknown or other user ids', async () => {
    const goal = await addGoal('G');
    const parent = await addTask('P');
    const sub = await addTask('S', alice, { parentTaskId: parent.id });
    const refused = await putGoal(sub.id, goal.item.id);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({
      error: { code: 'validation_error', message: 'Link the parent task instead.' },
    });
    expect((await call('PUT', `/tasks/${parent.id}/goal`, alice, { goalId: 'x' })).statusCode).toBe(
      400,
    );
    expect((await call('PUT', `/tasks/${parent.id}/goal`, alice, {})).statusCode).toBe(400);
    expect((await putGoal(parent.id, MISSING)).statusCode).toBe(404);
    expect((await putGoal(MISSING, goal.item.id)).statusCode).toBe(404);
    expect((await putGoal(parent.id, goal.item.id, bob)).statusCode).toBe(404);
    const bobTask = await addTask('B', bob);
    expect((await putGoal(bobTask.id, goal.item.id, bob)).statusCode).toBe(404);
    // A task id is not a goal
    expect((await putGoal(parent.id, bobTask.id)).statusCode).toBe(404);
    expect((await getGoal(goal.item.id)).progress.total).toBe(0);
  });
});
