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
    sql`truncate table time_entries, project_milestones, projects, clients, goals, notes, note_folders, entity_tags, tags, links, tasks, entities, auth.users cascade`,
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

interface Row {
  id: string;
  title: string;
  name: string;
  status: string;
  progress: { done: number; total: number };
  tasks: unknown[];
  notes: unknown[];
  [key: string]: unknown;
}
interface Written<T = Row> {
  item: T;
  items: T[];
  undo: { action: string; input: Record<string, unknown> } | null;
}

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

const create = async (url: string, payload: unknown, headers = alice) =>
  (await call('POST', url, headers, payload)).json<Written>();
const addProject = (title: string, headers = alice) => create('/projects', { title }, headers);

describe('login is required on every projects route', () => {
  it.each([
    ['GET', '/clients'],
    ['POST', '/clients'],
    ['GET', `/clients/${MISSING}`],
    ['GET', '/projects'],
    ['POST', '/projects'],
    ['GET', `/projects/${MISSING}/items`],
    ['GET', `/projects/${MISSING}/milestones`],
    ['PATCH', `/milestones/${MISSING}`],
    ['GET', `/tasks/${MISSING}/project`],
    ['PUT', `/tasks/${MISSING}/project`],
    ['PUT', `/notes/${MISSING}/project`],
    ['GET', '/time-entries'],
    ['GET', '/time-entries/running'],
    ['GET', '/time-entries/summary'],
    ['POST', '/time-entries/start'],
    ['POST', '/time-entries/stop'],
    ['DELETE', `/time-entries/${MISSING}`],
  ] as const)('%s %s answers 401 without a token', async (method, url) => {
    expect((await call(method, url, {})).statusCode).toBe(401);
  });
});

describe('clients routes', () => {
  it('creates (201 with undo), reads, lists, updates, deletes, and undoes through /undo', async () => {
    const created = await call('POST', '/clients', alice, { name: 'Acme' });
    expect(created.statusCode).toBe(201);
    const { item, undo } = created.json<Written>();
    expect(item).toMatchObject({ name: 'Acme', projectCount: 0 });
    expect(undo).toEqual({ action: 'clients.delete', input: { id: item.id } });

    expect((await call('GET', `/clients/${item.id}`)).json<Written>().item.name).toBe('Acme');
    expect((await call('GET', '/clients')).json<Written>().items).toHaveLength(1);
    const patched = await call('PATCH', `/clients/${item.id}`, alice, { company: 'Acme Ltd' });
    expect(patched.json<Written>().item.company).toBe('Acme Ltd');
    expect((await call('PATCH', `/clients/${item.id}`, alice, {})).statusCode).toBe(400);

    const deleted = await call('DELETE', `/clients/${item.id}`);
    expect(deleted.statusCode).toBe(200);
    expect((await call('GET', `/clients/${item.id}`)).statusCode).toBe(404);
    const restored = await call('POST', '/undo', alice, deleted.json<Written>().undo);
    expect(restored.statusCode).toBe(200);
    expect((await call('GET', `/clients/${item.id}`)).statusCode).toBe(200);
  });

  it('hides clients from another user', async () => {
    const { item } = await create('/clients', { name: 'Acme' });
    expect((await call('GET', `/clients/${item.id}`, bob)).statusCode).toBe(404);
    expect((await call('GET', '/clients', bob)).json<Written>().items).toEqual([]);
  });
});

describe('projects routes', () => {
  it('creates, reads, lists, updates, sets status, deletes', async () => {
    const created = await call('POST', '/projects', alice, { title: 'Site' });
    expect(created.statusCode).toBe(201);
    const { item } = created.json<Written>();
    expect((await call('GET', `/projects/${item.id}`)).json<Written>().item.title).toBe('Site');
    expect((await call('GET', '/projects?status=active')).json<Written>().items).toHaveLength(1);
    expect((await call('GET', '/projects?status=bogus')).statusCode).toBe(400);
    expect(
      (await call('PATCH', `/projects/${item.id}`, alice, { title: 'Site 2' })).json<Written>().item
        .title,
    ).toBe('Site 2');
    const status = await call('POST', `/projects/${item.id}/status`, alice, { status: 'done' });
    expect(status.json<Written>().item.status).toBe('done');
    expect(status.json<Written>().undo).toEqual({
      action: 'projects.setStatus',
      input: { id: item.id, status: 'active' },
    });
    expect((await call('DELETE', `/projects/${item.id}`)).statusCode).toBe(200);
    expect((await call('GET', `/projects/${item.id}`)).statusCode).toBe(404);
    expect((await call('GET', `/projects/${item.id}`, bob)).statusCode).toBe(404);
  });

  it('links a task and a note, reads the items and the task project, and unlinks', async () => {
    const { item: project } = await addProject('P');
    const task = (await create('/tasks', { title: 'T' })).item;
    const note = (await create('/notes', { title: 'N' })).item;

    const put = await call('PUT', `/tasks/${task.id}/project`, alice, { projectId: project.id });
    expect(put.statusCode).toBe(200);
    expect(put.json<Written>().item.progress).toEqual({ done: 0, total: 1 });
    expect(put.json<Written>().undo).toEqual({
      action: 'projects.setTaskProject',
      input: { taskId: task.id, projectId: null },
    });
    await call('PUT', `/notes/${note.id}/project`, alice, { projectId: project.id });

    expect((await call('GET', `/tasks/${task.id}/project`)).json<Written>().item).toEqual({
      id: project.id,
      title: 'P',
    });
    const items = (await call('GET', `/projects/${project.id}/items`)).json<Written>().item;
    expect(items.tasks).toHaveLength(1);
    expect(items.notes).toHaveLength(1);

    const out = await call('PUT', `/tasks/${task.id}/project`, alice, { projectId: null });
    expect(out.statusCode).toBe(200);
    expect((await call('GET', `/tasks/${task.id}/project`)).json<Written>().item).toBeNull();
    const back = await call('POST', '/undo', alice, out.json<Written>().undo);
    expect(back.json<Written>().item.progress.total).toBe(1);

    expect(
      (await call('PUT', `/tasks/${task.id}/project`, alice, { projectId: 'nope' })).statusCode,
    ).toBe(400);
    expect(
      (await call('PUT', `/tasks/${task.id}/project`, bob, { projectId: project.id })).statusCode,
    ).toBe(404);
  });
});

describe('milestones routes', () => {
  it('lists, creates, updates, deletes', async () => {
    const { item: project } = await addProject('P');
    const created = await call('POST', `/projects/${project.id}/milestones`, alice, {
      title: 'M1',
    });
    expect(created.statusCode).toBe(201);
    const milestone = created.json<Written>().item;
    expect(
      (await call('GET', `/projects/${project.id}/milestones`)).json<Written>().items,
    ).toHaveLength(1);
    const done = await call('PATCH', `/milestones/${milestone.id}`, alice, { done: true });
    expect(done.json<Written>().item.doneAt).not.toBeNull();
    expect((await call('GET', `/projects/${project.id}`)).json<Written>().item.milestones).toEqual({
      done: 1,
      total: 1,
    });
    expect(
      (await call('PATCH', `/milestones/${milestone.id}`, bob, { done: false })).statusCode,
    ).toBe(404);
    const deleted = await call('DELETE', `/milestones/${milestone.id}`);
    expect(deleted.statusCode).toBe(200);
    const restored = await call('POST', '/undo', alice, deleted.json<Written>().undo);
    expect(restored.json<Written>().item.id).toBe(milestone.id);
  });
});

describe('time-entries routes', () => {
  it('starts, reads the running one, stops, adds, lists, summarises, edits and deletes', async () => {
    const { item: project } = await addProject('P');
    expect((await call('GET', '/time-entries/running')).json<Written>().item).toBeNull();

    const started = await call('POST', '/time-entries/start', alice, { projectId: project.id });
    expect(started.statusCode).toBe(201);
    const entry = started.json<Written>().item;
    expect((await call('GET', '/time-entries/running')).json<Written>().item.id).toBe(entry.id);

    const stopped = await call('POST', '/time-entries/stop');
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json<Written>().item.endedAt).not.toBeNull();
    expect(stopped.json<Written>().undo).toBeNull();
    expect((await call('POST', '/time-entries/stop')).statusCode).toBe(404);

    const added = await call('POST', '/time-entries', alice, {
      projectId: project.id,
      startedAt: new Date(Date.now() - 7_200_000).toISOString(),
      endedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(added.statusCode).toBe(201);
    expect(added.json<Written>().item.seconds).toBe(3600);
    expect(
      (await call('GET', `/time-entries?projectId=${project.id}&limit=1`)).json<Written>().items,
    ).toHaveLength(1);

    const summary = (await call('GET', '/time-entries/summary?weeks=2')).json<Written>().item;
    expect(summary.byWeek).toHaveLength(2);
    expect(summary.totalSeconds).toBeGreaterThanOrEqual(3600);
    expect((await call('GET', '/time-entries/summary?weeks=0')).statusCode).toBe(400);

    const id = added.json<Written>().item.id;
    expect(
      (await call('PATCH', `/time-entries/${id}`, alice, { note: 'hi' })).json<Written>().item.note,
    ).toBe('hi');
    expect((await call('PATCH', `/time-entries/${id}`, bob, { note: 'x' })).statusCode).toBe(404);
    const deleted = await call('DELETE', `/time-entries/${id}`);
    expect(deleted.statusCode).toBe(200);
    const restored = await call('POST', '/undo', alice, deleted.json<Written>().undo);
    expect(restored.json<Written>().item.id).toBe(id);

    expect((await call('GET', '/time-entries', bob)).json<Written>().items).toEqual([]);
    expect(
      (await call('POST', '/time-entries/start', bob, { projectId: project.id })).statusCode,
    ).toBe(404);
  });
});
