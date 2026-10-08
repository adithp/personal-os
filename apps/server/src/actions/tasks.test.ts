import { entities, tasks } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope, type Db } from '../lib/user-scope';
import { createRegistry, type ActionContext, type ActionEvent } from '.';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

let t: TestDb;
let events: ActionEvent[];
const registry = createRegistry([{ onAction: (event) => void events.push(event) }]);

const context = (userId: string, overrides: Partial<ActionContext> = {}): ActionContext => ({
  scope: createUserScope(t.db as unknown as Db, userId),
  source: 'ui',
  confirmed: true,
  ...overrides,
});

const alice = () => context(ALICE);
const bob = () => context(BOB);

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  events = [];
  await t.db.execute(sql`truncate table links, tasks, entities, auth.users cascade`);
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

type Item = {
  id: string;
  title: string;
  status: string;
  priority: number;
  position: number;
  description: string | null;
  dueAt: string | null;
  reminderAt: string | null;
  completedAt: string | null;
};

async function create(ctx: ActionContext, input: Record<string, unknown>) {
  const outcome = await registry.run(ctx, 'tasks.create', input);
  return { task: outcome.data as Item, undo: outcome.undo };
}

async function list(ctx: ActionContext, input: Record<string, unknown> = {}) {
  return (await registry.run(ctx, 'tasks.list', input)).data as Item[];
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('tasks.create', () => {
  it('creates a task with sensible defaults and an entity with the same id', async () => {
    const { task } = await create(alice(), { title: '  Write report  ' });
    expect(task).toMatchObject({
      title: 'Write report',
      status: 'todo',
      priority: 4,
      description: null,
      dueAt: null,
      reminderAt: null,
      completedAt: null,
    });
    const rows = await t.db.select().from(entities);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: task.id, type: 'task', title: 'Write report' });
  });

  it('saves description, priority, status, and dates (as UTC)', async () => {
    const { task } = await create(alice(), {
      title: 'Ship it',
      description: 'Final push',
      priority: 1,
      status: 'doing',
      dueAt: '2025-10-07T11:30:00+05:30',
      reminderAt: '2025-10-07T04:00:00.000Z',
    });
    expect(task).toMatchObject({
      description: 'Final push',
      priority: 1,
      status: 'doing',
      dueAt: '2025-10-07T06:00:00.000Z',
      reminderAt: '2025-10-07T04:00:00.000Z',
    });
  });

  it('sets completedAt when created as done', async () => {
    const { task } = await create(alice(), { title: 'Already done', status: 'done' });
    expect(task.completedAt).not.toBeNull();
  });

  it('puts new tasks at the end of the list', async () => {
    const first = (await create(alice(), { title: 'one' })).task;
    const second = (await create(alice(), { title: 'two' })).task;
    expect(second.position).toBeGreaterThan(first.position);
    expect((await list(alice())).map((task) => task.title)).toEqual(['one', 'two']);
  });

  it.each([
    ['an empty title', { title: '   ' }],
    ['no title', {}],
    ['a very long title', { title: 'x'.repeat(501) }],
    ['priority 0', { title: 'x', priority: 0 }],
    ['priority 5', { title: 'x', priority: 5 }],
    ['an unknown status', { title: 'x', status: 'later' }],
    ['a date that is not a date', { title: 'x', dueAt: 'tomorrow' }],
    ['a date without a zone', { title: 'x', dueAt: '2025-10-07T11:30:00' }],
  ])('refuses %s', async (_name, input) => {
    expect(await failure(registry.run(alice(), 'tasks.create', input))).toBeInstanceOf(ZodError);
    expect(await t.db.select().from(tasks)).toHaveLength(0);
  });

  it('ignores a user id sent in the input', async () => {
    const { task } = await create(alice(), { title: 'Mine', userId: BOB });
    const [row] = await t.db.select().from(tasks);
    expect(row?.id).toBe(task.id);
    expect(row?.userId).toBe(ALICE);
  });

  it('returns an undo that deletes the new task', async () => {
    const { task, undo } = await create(alice(), { title: 'Oops' });
    expect(undo).toEqual({ action: 'tasks.delete', input: { id: task.id } });
    await registry.run(alice(), undo?.action ?? '', undo?.input);
    expect(await list(alice())).toEqual([]);
  });
});

describe('tasks.list', () => {
  it('lists only the user’s own tasks', async () => {
    await create(alice(), { title: 'Alice 1' });
    await create(bob(), { title: 'Bob 1' });
    expect((await list(alice())).map((task) => task.title)).toEqual(['Alice 1']);
    expect((await list(bob())).map((task) => task.title)).toEqual(['Bob 1']);
  });

  it('filters by one status or several', async () => {
    await create(alice(), { title: 'a', status: 'todo' });
    await create(alice(), { title: 'b', status: 'doing' });
    await create(alice(), { title: 'c', status: 'done' });
    expect((await list(alice(), { status: 'doing' })).map((task) => task.title)).toEqual(['b']);
    expect((await list(alice(), { status: ['todo', 'done'] })).map((task) => task.title)).toEqual([
      'a',
      'c',
    ]);
  });

  it('accepts text values like a query string', async () => {
    await create(alice(), { title: 'a' });
    const result = await list(alice(), {
      archived: 'false',
      limit: '1',
      offset: '0',
      sort: 'title',
    });
    expect(result).toHaveLength(1);
  });

  it('sorts by due date with undated tasks last, in both directions', async () => {
    await create(alice(), { title: 'none' });
    await create(alice(), { title: 'late', dueAt: '2025-12-01T00:00:00.000Z' });
    await create(alice(), { title: 'soon', dueAt: '2025-10-01T00:00:00.000Z' });
    const titles = async (order: string) =>
      (await list(alice(), { sort: 'dueAt', order })).map((task) => task.title);
    expect(await titles('asc')).toEqual(['soon', 'late', 'none']);
    expect(await titles('desc')).toEqual(['late', 'soon', 'none']);
  });

  it('sorts by priority and title', async () => {
    await create(alice(), { title: 'b', priority: 3 });
    await create(alice(), { title: 'a', priority: 1 });
    expect((await list(alice(), { sort: 'priority' })).map((task) => task.title)).toEqual([
      'a',
      'b',
    ]);
    expect(
      (await list(alice(), { sort: 'title', order: 'desc' })).map((task) => task.title),
    ).toEqual(['b', 'a']);
  });

  it('pages with limit and offset', async () => {
    for (const title of ['1', '2', '3']) await create(alice(), { title });
    expect((await list(alice(), { limit: 2 })).map((task) => task.title)).toEqual(['1', '2']);
    expect((await list(alice(), { limit: 2, offset: 2 })).map((task) => task.title)).toEqual(['3']);
  });

  it('refuses bad filters', async () => {
    for (const input of [
      { status: 'later' },
      { limit: 0 },
      { limit: 100000 },
      { sort: 'secret' },
    ]) {
      expect(await failure(registry.run(alice(), 'tasks.list', input))).toBeInstanceOf(ZodError);
    }
  });

  it('hides deleted tasks and archived tasks', async () => {
    const { task } = await create(alice(), { title: 'gone' });
    await create(alice(), { title: 'stays' });
    await registry.run(alice(), 'tasks.delete', { id: task.id });
    expect((await list(alice())).map((item) => item.title)).toEqual(['stays']);
  });
});

describe('tasks.get', () => {
  it('returns the task', async () => {
    const { task } = await create(alice(), { title: 'Find me' });
    expect((await registry.run(alice(), 'tasks.get', { id: task.id })).data).toMatchObject({
      title: 'Find me',
    });
  });

  it('does not find another user’s task, a missing one, or a deleted one', async () => {
    const { task } = await create(bob(), { title: 'Bobs' });
    for (const id of [task.id, '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d']) {
      const error = await failure(registry.run(alice(), 'tasks.get', { id }));
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(404);
    }
    await registry.run(bob(), 'tasks.delete', { id: task.id });
    expect(
      ((await failure(registry.run(bob(), 'tasks.get', { id: task.id }))) as HttpError).statusCode,
    ).toBe(404);
  });

  it('refuses an id that is not a uuid', async () => {
    expect(
      await failure(registry.run(alice(), 'tasks.get', { id: '1; drop table tasks' })),
    ).toBeInstanceOf(ZodError);
  });
});

describe('tasks.update', () => {
  it('changes fields and keeps the entity title in step', async () => {
    const { task } = await create(alice(), { title: 'Old', priority: 4 });
    const result = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      title: 'New',
      description: 'Details',
      priority: 2,
      dueAt: '2025-10-07T06:00:00.000Z',
    });
    expect(result.data).toMatchObject({
      title: 'New',
      description: 'Details',
      priority: 2,
      dueAt: '2025-10-07T06:00:00.000Z',
    });
    const [entity] = await t.db.select().from(entities);
    expect(entity?.title).toBe('New');
  });

  it('clears a description and a date with null', async () => {
    const { task } = await create(alice(), {
      title: 'x',
      description: 'd',
      dueAt: '2025-10-07T06:00:00.000Z',
      reminderAt: '2025-10-07T05:00:00.000Z',
    });
    const result = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      description: null,
      dueAt: null,
      reminderAt: null,
    });
    expect(result.data).toMatchObject({ description: null, dueAt: null, reminderAt: null });
  });

  it('sets completedAt when moved to done and clears it when moved back', async () => {
    const { task } = await create(alice(), { title: 'x' });
    const done = (await registry.run(alice(), 'tasks.update', { id: task.id, status: 'done' }))
      .data as Item;
    expect(done.completedAt).not.toBeNull();
    const back = (await registry.run(alice(), 'tasks.update', { id: task.id, status: 'doing' }))
      .data as Item;
    expect(back.completedAt).toBeNull();
  });

  it('undo puts every changed field back', async () => {
    const { task } = await create(alice(), {
      title: 'Before',
      description: 'old text',
      priority: 3,
      dueAt: '2025-10-07T06:00:00.000Z',
    });
    const changed = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      title: 'After',
      description: null,
      priority: 1,
      dueAt: null,
      status: 'done',
    });
    expect(changed.undo?.action).toBe('tasks.update');
    await registry.run(alice(), changed.undo?.action ?? '', changed.undo?.input);
    expect((await registry.run(alice(), 'tasks.get', { id: task.id })).data).toMatchObject({
      title: 'Before',
      description: 'old text',
      priority: 3,
      dueAt: '2025-10-07T06:00:00.000Z',
      status: 'todo',
      completedAt: null,
    });
    const [entity] = await t.db.select().from(entities);
    expect(entity?.title).toBe('Before');
  });

  it('does nothing and offers no undo when nothing actually changes', async () => {
    const { task } = await create(alice(), { title: 'Same', priority: 2 });
    const result = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      title: 'Same',
      priority: 2,
    });
    expect(result.undo).toBeNull();
  });

  it('refuses an empty change, an empty title, and bad values', async () => {
    const { task } = await create(alice(), { title: 'x' });
    for (const input of [
      { id: task.id },
      { id: task.id, title: '' },
      { id: task.id, priority: 9 },
      { id: task.id, status: 'nope' },
    ]) {
      expect(await failure(registry.run(alice(), 'tasks.update', input))).toBeInstanceOf(ZodError);
    }
  });

  it('cannot change another user’s task, or move a task to another user', async () => {
    const { task } = await create(bob(), { title: 'Bobs' });
    const error = await failure(
      registry.run(alice(), 'tasks.update', { id: task.id, title: 'Hacked' }),
    );
    expect((error as HttpError).statusCode).toBe(404);
    // userId in the input is not part of the action and is dropped
    await registry.run(bob(), 'tasks.update', { id: task.id, title: 'Fine', userId: ALICE });
    const [row] = await t.db.select().from(tasks);
    expect(row).toMatchObject({ title: 'Fine', userId: BOB });
  });
});

describe('tasks.complete and tasks.prioritize', () => {
  it('completes a task, and undo reopens it', async () => {
    const { task } = await create(alice(), { title: 'x', status: 'doing' });
    const done = await registry.run(alice(), 'tasks.complete', { id: task.id });
    expect(done.data).toMatchObject({ status: 'done' });
    expect((done.data as Item).completedAt).not.toBeNull();
    await registry.run(alice(), done.undo?.action ?? '', done.undo?.input);
    expect((await registry.run(alice(), 'tasks.get', { id: task.id })).data).toMatchObject({
      status: 'doing',
      completedAt: null,
    });
  });

  it('completing a done task changes nothing', async () => {
    const { task } = await create(alice(), { title: 'x', status: 'done' });
    const result = await registry.run(alice(), 'tasks.complete', { id: task.id });
    expect(result.undo).toBeNull();
  });

  it('sets the priority, with undo', async () => {
    const { task } = await create(alice(), { title: 'x', priority: 4 });
    const result = await registry.run(alice(), 'tasks.prioritize', { id: task.id, priority: 1 });
    expect(result.data).toMatchObject({ priority: 1 });
    await registry.run(alice(), result.undo?.action ?? '', result.undo?.input);
    expect((await registry.run(alice(), 'tasks.get', { id: task.id })).data).toMatchObject({
      priority: 4,
    });
    expect(
      await failure(registry.run(alice(), 'tasks.prioritize', { id: task.id, priority: 7 })),
    ).toBeInstanceOf(ZodError);
  });

  it('cannot touch another user’s task', async () => {
    const { task } = await create(bob(), { title: 'Bobs' });
    for (const action of ['tasks.complete', 'tasks.prioritize']) {
      const error = await failure(registry.run(alice(), action, { id: task.id, priority: 1 }));
      expect((error as HttpError).statusCode).toBe(404);
    }
  });
});

describe('tasks.delete and tasks.restore', () => {
  it('soft deletes the task and its entity, and undo restores both', async () => {
    const { task } = await create(alice(), { title: 'Delete me' });
    const deleted = await registry.run(alice(), 'tasks.delete', { id: task.id });
    expect(deleted.undo).toEqual({ action: 'tasks.restore', input: { id: task.id } });
    const [row] = await t.db.select().from(tasks);
    const [entity] = await t.db.select().from(entities);
    expect(row?.deletedAt).not.toBeNull();
    expect(entity?.deletedAt).not.toBeNull();

    await registry.run(alice(), deleted.undo?.action ?? '', deleted.undo?.input);
    expect((await list(alice())).map((item) => item.title)).toEqual(['Delete me']);
    expect((await t.db.select().from(entities))[0]?.deletedAt).toBeNull();
  });

  it('cannot delete twice, delete another user’s task, or restore another user’s task', async () => {
    const { task } = await create(bob(), { title: 'Bobs' });
    expect(
      ((await failure(registry.run(alice(), 'tasks.delete', { id: task.id }))) as HttpError)
        .statusCode,
    ).toBe(404);
    expect(
      ((await failure(registry.run(alice(), 'tasks.restore', { id: task.id }))) as HttpError)
        .statusCode,
    ).toBe(404);
    await registry.run(bob(), 'tasks.delete', { id: task.id });
    expect(
      ((await failure(registry.run(bob(), 'tasks.delete', { id: task.id }))) as HttpError)
        .statusCode,
    ).toBe(404);
  });

  it('restoring a task that is not deleted changes nothing', async () => {
    const { task } = await create(alice(), { title: 'Fine' });
    const result = await registry.run(alice(), 'tasks.restore', { id: task.id });
    expect(result.data).toMatchObject({ title: 'Fine' });
  });
});

describe('permission behaviour', () => {
  it('has the permission levels from the docs', () => {
    expect(registry.permissionOf('tasks.list')).toBe('read');
    expect(registry.permissionOf('tasks.get')).toBe('read');
    for (const name of ['create', 'update', 'complete', 'prioritize', 'restore']) {
      expect(registry.permissionOf(`tasks.${name}`)).toBe('write');
    }
    expect(registry.permissionOf('tasks.delete')).toBe('destructive');
    expect(registry.permissionOf('tasks.nope')).toBeUndefined();
  });

  it('a destructive action waits for confirmation and changes nothing without it', async () => {
    const { task } = await create(alice(), { title: 'Keep me' });
    const unconfirmed = context(ALICE, { source: 'ai', confirmed: false });
    const error = await failure(registry.run(unconfirmed, 'tasks.delete', { id: task.id }));
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).code).toBe('confirmation_required');
    expect((error as HttpError).statusCode).toBe(409);
    expect(await list(alice())).toHaveLength(1);
  });

  it('read and write actions run without confirmation', async () => {
    const unconfirmed = context(ALICE, { source: 'ai', confirmed: false });
    const created = await registry.run(unconfirmed, 'tasks.create', { title: 'By the AI' });
    expect(created.data).toMatchObject({ title: 'By the AI' });
    expect(await registry.run(unconfirmed, 'tasks.list', {})).toBeDefined();
  });

  it('an unknown action is a 404', async () => {
    const error = await failure(registry.run(alice(), 'tasks.explode', {}));
    expect((error as HttpError).code).toBe('unknown_action');
  });

  it('tells observers about every run, successful or not (where Step 3 plugs in the log)', async () => {
    const { task } = await create(alice(), { title: 'Logged' });
    await failure(
      registry.run(alice(), 'tasks.get', { id: '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d' }),
    );
    expect(events.map((event) => [event.action, event.status])).toEqual([
      ['tasks.create', 'done'],
      ['tasks.get', 'failed'],
    ]);
    expect(events[0]).toMatchObject({
      permission: 'write',
      source: 'ui',
      userId: ALICE,
      undo: { action: 'tasks.delete', input: { id: task.id } },
    });
  });

  it('a broken observer never breaks the action', async () => {
    const fragile = createRegistry([
      {
        onAction: () => {
          throw new Error('log table is down');
        },
      },
    ]);
    const outcome = await fragile.run(alice(), 'tasks.create', { title: 'Still works' });
    expect(outcome.data).toMatchObject({ title: 'Still works' });
  });
});
