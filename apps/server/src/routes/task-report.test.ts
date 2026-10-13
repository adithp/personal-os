import { entities, tasks } from '@personal-os/db';
import { taskReportSchema } from '@personal-os/shared';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeAll(async () => {
  t = await createTestDb();
  keys = await createTestKeys();
  alice = { authorization: `Bearer ${await keys.sign({ sub: USER_ID })}` };
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
  vi.useRealTimers();
  await app.close();
});

const get = (url: string, headers: Record<string, string> = alice) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers });

async function addDone(userId: string, completedAt: string) {
  const [entity] = await t.db
    .insert(entities)
    .values({ userId, type: 'task', title: 'x' })
    .returning();
  if (!entity) throw new Error('no entity');
  await t.db.insert(tasks).values({
    id: entity.id,
    userId,
    title: 'x',
    status: 'done',
    completedAt: new Date(completedAt),
  });
}

describe('GET /tasks/report', () => {
  it('answers 401 with no token, a stranger token, or an expired one', async () => {
    expect((await get('/tasks/report?period=week', {})).statusCode).toBe(401);
    const stranger = { authorization: `Bearer ${await keys.signWithUnknownKey()}` };
    expect((await get('/tasks/report?period=week', stranger)).statusCode).toBe(401);
    const expired = {
      authorization: `Bearer ${await keys.sign({ sub: USER_ID, expiresIn: -60 })}`,
    };
    expect((await get('/tasks/report?period=week', expired)).statusCode).toBe(401);
  });

  it('answers 400 when the period is missing or not week or month', async () => {
    for (const url of ['/tasks/report', '/tasks/report?period=year', '/tasks/report?period=']) {
      const response = await get(url);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('validation_error');
    }
  });

  it('answers { item } with the report for the week and for the month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T06:30:00.000Z'));
    // 00:10 IST on Monday 12 Oct is Sunday 11 Oct in UTC
    await addDone(USER_ID, '2026-10-11T18:40:00.000Z');
    await addDone(OTHER_USER_ID, '2026-10-14T03:00:00.000Z');
    // A token made after the clock was set, so it is not expired for the fake date
    alice = { authorization: `Bearer ${await keys.sign({ sub: USER_ID })}` };
    const week = await get('/tasks/report?period=week');
    expect(week.statusCode).toBe(200);
    const item = taskReportSchema.parse(week.json<{ item: unknown }>().item);
    expect(item).toMatchObject({ period: 'week', start: '2026-10-12', end: '2026-10-18' });
    expect(item.days[0]).toMatchObject({ date: '2026-10-12', done: 1, noDueDate: 1 });
    expect(item.totals.done).toBe(1);

    const month = taskReportSchema.parse(
      (await get('/tasks/report?period=month')).json<{ item: unknown }>().item,
    );
    expect(month).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(month.days).toHaveLength(31);
  });
});
