import { entities, tasks } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext, type ActionEvent } from '.';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

let t: TestDb;
let events: ActionEvent[];
const registry = createRegistry([{ onAction: (event) => void events.push(event) }]);

const context = (userId: string, overrides: Partial<ActionContext> = {}): ActionContext => ({
  scope: createUserScope(t.db, userId),
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
  await t.db.execute(
    sql`truncate table entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

interface Item {
  id: string;
  title: string;
  status: string;
  priority: number;
  position: number;
  description: string | null;
  dueAt: string | null;
  reminderAt: string | null;
  completedAt: string | null;
}

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

// ---- Tasks redesign (Feature 1): tags, subtasks, all-day, archive, filters ----

interface Full extends Item {
  tags: { id: string; name: string; color: string }[];
  subtaskCount: number;
  subtasksDone: number;
  blockedBy: unknown[];
  dueAllDay: boolean;
  parentTaskId: string | null;
  archivedAt: string | null;
}

const fullList = async (ctx: ActionContext, input: Record<string, unknown> = {}) =>
  (await registry.run(ctx, 'tasks.list', input)).data as Full[];
const titles = (items: { title: string }[]) => items.map((item) => item.title);
const getFull = async (ctx: ActionContext, id: string) =>
  (await registry.run(ctx, 'tasks.get', { id })).data as Full;
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

async function tag(ctx: ActionContext, name: string, color?: string) {
  return (await registry.run(ctx, 'tags.create', { name, color })).data as { id: string };
}

async function httpError(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
}

describe('task tags', () => {
  it('returns the tags of every task, ordered by name, in a list and in get', async () => {
    const work = await tag(alice(), 'work');
    const home = await tag(alice(), 'Home');
    const { task: one } = await create(alice(), { title: 'one', tagIds: [work.id, home.id] });
    const { task: two } = await create(alice(), { title: 'two' });
    const items = await fullList(alice());
    expect(items.find((item) => item.id === one.id)?.tags.map((x) => x.name)).toEqual([
      'Home',
      'work',
    ]);
    expect(items.find((item) => item.id === two.id)?.tags).toEqual([]);
    expect((await getFull(alice(), one.id)).tags.map((x) => x.name)).toEqual(['Home', 'work']);
  });

  it('does not return a deleted tag', async () => {
    const work = await tag(alice(), 'work');
    const { task } = await create(alice(), { title: 'one', tagIds: [work.id] });
    await t.db.execute(sql`update tags set deleted_at = now()`);
    expect((await getFull(alice(), task.id)).tags).toEqual([]);
  });

  it('refuses another user’s tag, a missing tag, or a deleted tag when creating', async () => {
    const bobsTag = await tag(bob(), 'secret');
    for (const id of [bobsTag.id, MISSING]) {
      const error = await httpError(
        registry.run(alice(), 'tasks.create', { title: 'x', tagIds: [id] }),
      );
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Tag not found');
    }
    expect(await t.db.select().from(tasks)).toHaveLength(0);
    const mine = await tag(alice(), 'mine');
    await t.db.execute(sql`update tags set deleted_at = now() where id = ${mine.id}`);
    const error = await httpError(
      registry.run(alice(), 'tasks.create', { title: 'x', tagIds: [mine.id] }),
    );
    expect(error.statusCode).toBe(404);
  });

  it('refuses another user’s tag when updating and changes nothing', async () => {
    const bobsTag = await tag(bob(), 'secret');
    const mine = await tag(alice(), 'mine');
    const { task } = await create(alice(), { title: 'x', tagIds: [mine.id] });
    const error = await httpError(
      registry.run(alice(), 'tasks.update', { id: task.id, tagIds: [bobsTag.id] }),
    );
    expect(error.statusCode).toBe(404);
    expect((await getFull(alice(), task.id)).tags.map((x) => x.id)).toEqual([mine.id]);
  });

  it('never shows another user’s tagged tasks', async () => {
    const bobsTag = await tag(bob(), 'secret');
    await create(bob(), { title: 'bobs', tagIds: [bobsTag.id] });
    expect(await fullList(alice())).toHaveLength(0);
    expect((await fullList(bob()))[0]?.tags.map((x) => x.id)).toEqual([bobsTag.id]);
  });

  it('counts a repeated tag id once', async () => {
    const work = await tag(alice(), 'work');
    const { task } = await create(alice(), { title: 'x', tagIds: [work.id, work.id] });
    expect((await getFull(alice(), task.id)).tags).toHaveLength(1);
  });

  it('update replaces the tags and the undo puts the old set back', async () => {
    const a = await tag(alice(), 'a');
    const b = await tag(alice(), 'b');
    const { task } = await create(alice(), { title: 'x', tagIds: [a.id] });
    const changed = await registry.run(alice(), 'tasks.update', { id: task.id, tagIds: [b.id] });
    expect((changed.data as Full).tags.map((x) => x.id)).toEqual([b.id]);
    await registry.run(alice(), changed.undo?.action ?? '', changed.undo?.input);
    expect((await getFull(alice(), task.id)).tags.map((x) => x.id)).toEqual([a.id]);
    const cleared = await registry.run(alice(), 'tasks.update', { id: task.id, tagIds: [] });
    expect((cleared.data as Full).tags).toEqual([]);
    await registry.run(alice(), cleared.undo?.action ?? '', cleared.undo?.input);
    expect((await getFull(alice(), task.id)).tags).toHaveLength(1);
  });

  it('the same tags again change nothing', async () => {
    const a = await tag(alice(), 'a');
    const { task } = await create(alice(), { title: 'x', tagIds: [a.id] });
    const result = await registry.run(alice(), 'tasks.update', { id: task.id, tagIds: [a.id] });
    expect(result.undo).toBeNull();
  });
});

describe('subtasks and counts', () => {
  it('counts live subtasks and done ones, and a subtask itself has 0', async () => {
    const { task: parent } = await create(alice(), { title: 'parent' });
    const { task: s1 } = await create(alice(), { title: 's1', parentTaskId: parent.id });
    const { task: s2 } = await create(alice(), { title: 's2', parentTaskId: parent.id });
    await create(alice(), { title: 's3', parentTaskId: parent.id });
    await registry.run(alice(), 'tasks.complete', { id: s1.id });
    await registry.run(alice(), 'tasks.delete', { id: s2.id });
    expect(await getFull(alice(), parent.id)).toMatchObject({ subtaskCount: 2, subtasksDone: 1 });
    expect(await getFull(alice(), s1.id)).toMatchObject({
      subtaskCount: 0,
      subtasksDone: 0,
      parentTaskId: parent.id,
    });
  });

  it('allows one level only', async () => {
    const { task: parent } = await create(alice(), { title: 'parent' });
    const { task: sub } = await create(alice(), { title: 'sub', parentTaskId: parent.id });
    const error = await httpError(
      registry.run(alice(), 'tasks.create', { title: 'deep', parentTaskId: sub.id }),
    );
    expect(error).toMatchObject({ statusCode: 400, code: 'validation_error' });
    expect(error.message).toBe('Subtasks go one level deep only');
  });

  it('needs a parent that exists, is the user’s own, and is not deleted', async () => {
    const { task: bobs } = await create(bob(), { title: 'bobs' });
    const { task: gone } = await create(alice(), { title: 'gone' });
    await registry.run(alice(), 'tasks.delete', { id: gone.id });
    for (const parentTaskId of [bobs.id, gone.id, MISSING]) {
      const error = await httpError(
        registry.run(alice(), 'tasks.create', { title: 'x', parentTaskId }),
      );
      expect(error.statusCode).toBe(404);
    }
  });

  it('puts subtasks at the end of their siblings', async () => {
    const { task: parent } = await create(alice(), { title: 'parent' });
    await create(alice(), { title: 'other' });
    const { task: a } = await create(alice(), { title: 'a', parentTaskId: parent.id });
    const { task: b } = await create(alice(), { title: 'b', parentTaskId: parent.id });
    expect(a.position).toBe(1024);
    expect(b.position).toBeGreaterThan(a.position);
    expect(titles(await list(alice(), { parent: parent.id }))).toEqual(['a', 'b']);
  });

  it('hides subtasks from the default list and shows them with parent', async () => {
    const { task: parent } = await create(alice(), { title: 'parent' });
    await create(alice(), { title: 'sub', parentTaskId: parent.id });
    expect(titles(await list(alice()))).toEqual(['parent']);
    expect(titles(await list(alice(), { parent: 'none' }))).toEqual(['parent']);
    expect(titles(await list(alice(), { parent: parent.id }))).toEqual(['sub']);
  });

  it('another user cannot list the subtasks of my task', async () => {
    const { task: parent } = await create(alice(), { title: 'parent' });
    await create(alice(), { title: 'sub', parentTaskId: parent.id });
    expect(await list(bob(), { parent: parent.id })).toEqual([]);
  });

  it('deleting a parent does not touch its subtasks', async () => {
    const { task: parent } = await create(alice(), { title: 'parent' });
    const { task: sub } = await create(alice(), { title: 'sub', parentTaskId: parent.id });
    await registry.run(alice(), 'tasks.delete', { id: parent.id });
    const row = (await t.db.select().from(tasks)).find((r) => r.id === sub.id);
    expect(row?.deletedAt).toBeNull();
  });
});

describe('all-day dates', () => {
  it('saves dueAllDay on create and refuses it without a date', async () => {
    const { task } = await create(alice(), {
      title: 'x',
      dueAt: '2025-10-06T18:30:00.000Z',
      dueAllDay: true,
    });
    expect(task).toMatchObject({ dueAllDay: true });
    expect(
      await failure(registry.run(alice(), 'tasks.create', { title: 'x', dueAllDay: true })),
    ).toBeInstanceOf(ZodError);
  });

  it('update needs a date in the final state', async () => {
    const { task } = await create(alice(), { title: 'x' });
    const error = await httpError(
      registry.run(alice(), 'tasks.update', { id: task.id, dueAllDay: true }),
    );
    expect(error).toMatchObject({ statusCode: 400, code: 'validation_error' });
    const ok = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      dueAllDay: true,
      dueAt: '2025-10-06T18:30:00.000Z',
    });
    expect(ok.data).toMatchObject({ dueAllDay: true });
  });

  it('clearing the date of an all-day task clears the flag, and undo restores both', async () => {
    const { task } = await create(alice(), {
      title: 'x',
      dueAt: '2025-10-06T18:30:00.000Z',
      dueAllDay: true,
    });
    const cleared = await registry.run(alice(), 'tasks.update', { id: task.id, dueAt: null });
    expect(cleared.data).toMatchObject({ dueAt: null, dueAllDay: false });
    await registry.run(alice(), cleared.undo?.action ?? '', cleared.undo?.input);
    expect(await getFull(alice(), task.id)).toMatchObject({
      dueAt: '2025-10-06T18:30:00.000Z',
      dueAllDay: true,
    });
  });

  it('undo of a full edit restores dueAt, dueAllDay and tags', async () => {
    const a = await tag(alice(), 'a');
    const { task } = await create(alice(), { title: 'x', tagIds: [a.id] });
    const changed = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      dueAt: '2025-10-06T18:30:00.000Z',
      dueAllDay: true,
      tagIds: [],
    });
    await registry.run(alice(), changed.undo?.action ?? '', changed.undo?.input);
    const got = await getFull(alice(), task.id);
    expect(got).toMatchObject({ dueAt: null, dueAllDay: false });
    expect(got.tags.map((x) => x.id)).toEqual([a.id]);
  });
});

describe('archive and unarchive', () => {
  it('archives one task only, hides it, and undo brings it back', async () => {
    const { task: parent } = await create(alice(), { title: 'parent' });
    const { task: sub } = await create(alice(), { title: 'sub', parentTaskId: parent.id });
    await create(alice(), { title: 'other' });
    const result = await registry.run(alice(), 'tasks.archive', { id: parent.id });
    expect((result.data as Full).archivedAt).not.toBeNull();
    expect(result.undo).toEqual({ action: 'tasks.unarchive', input: { id: parent.id } });
    expect(titles(await list(alice()))).toEqual(['other']);
    expect(titles(await list(alice(), { archived: true }))).toEqual(['parent']);
    expect((await getFull(alice(), sub.id)).archivedAt).toBeNull();

    const back = await registry.run(alice(), result.undo?.action ?? '', result.undo?.input);
    expect((back.data as Full).archivedAt).toBeNull();
    expect(back.undo).toEqual({ action: 'tasks.archive', input: { id: parent.id } });
    expect(titles(await list(alice()))).toEqual(['parent', 'other']);
  });

  it('archiving twice or unarchiving an active task changes nothing', async () => {
    const { task } = await create(alice(), { title: 'x' });
    expect((await registry.run(alice(), 'tasks.unarchive', { id: task.id })).undo).toBeNull();
    await registry.run(alice(), 'tasks.archive', { id: task.id });
    expect((await registry.run(alice(), 'tasks.archive', { id: task.id })).undo).toBeNull();
  });

  it('cannot touch another user’s task, and refuses a bad id', async () => {
    const { task } = await create(bob(), { title: 'bobs' });
    for (const action of ['tasks.archive', 'tasks.unarchive']) {
      expect((await httpError(registry.run(alice(), action, { id: task.id }))).statusCode).toBe(
        404,
      );
    }
    expect(await failure(registry.run(alice(), 'tasks.archive', { id: 'x' }))).toBeInstanceOf(
      ZodError,
    );
    expect((await getFull(bob(), task.id)).archivedAt).toBeNull();
  });

  it('has write permission', () => {
    expect(registry.permissionOf('tasks.archive')).toBe('write');
    expect(registry.permissionOf('tasks.unarchive')).toBe('write');
  });
});

describe('tasks.list filters', () => {
  it('filters by priority (one or many)', async () => {
    await create(alice(), { title: 'p1', priority: 1 });
    await create(alice(), { title: 'p2', priority: 2 });
    await create(alice(), { title: 'p3', priority: 3 });
    expect(titles(await list(alice(), { priority: 1 }))).toEqual(['p1']);
    expect(titles(await list(alice(), { priority: ['1', '3'] }))).toEqual(['p1', 'p3']);
  });

  it('filters by any of several tags, and never by another user’s tag', async () => {
    const a = await tag(alice(), 'a');
    const b = await tag(alice(), 'b');
    const bobsTag = await tag(bob(), 'c');
    await create(alice(), { title: 'ta', tagIds: [a.id] });
    await create(alice(), { title: 'tb', tagIds: [b.id] });
    await create(alice(), { title: 'none' });
    await create(bob(), { title: 'bobs', tagIds: [bobsTag.id] });
    expect(titles(await list(alice(), { tagId: a.id }))).toEqual(['ta']);
    expect(titles(await list(alice(), { tagId: [a.id, b.id] }))).toEqual(['ta', 'tb']);
    expect(await list(alice(), { tagId: bobsTag.id })).toEqual([]);
  });

  it('filters by due range (start inclusive, end exclusive) and noDate', async () => {
    await create(alice(), { title: 'd1', dueAt: '2025-10-01T00:00:00.000Z' });
    await create(alice(), { title: 'd2', dueAt: '2025-10-02T00:00:00.000Z' });
    await create(alice(), { title: 'd3', dueAt: '2025-10-03T00:00:00.000Z' });
    await create(alice(), { title: 'nodate' });
    const range = await list(alice(), {
      dueFrom: '2025-10-01T00:00:00.000Z',
      dueTo: '2025-10-03T00:00:00.000Z',
      sort: 'dueAt',
    });
    expect(titles(range)).toEqual(['d1', 'd2']);
    expect(titles(await list(alice(), { dueFrom: '2025-10-03T00:00:00.000Z' }))).toEqual(['d3']);
    expect(titles(await list(alice(), { noDate: true }))).toEqual(['nodate']);
    expect(titles(await list(alice(), { noDate: 'true' }))).toEqual(['nodate']);
    expect(titles(await list(alice(), { noDate: false }))).toHaveLength(4);
  });

  it('filters by completion time', async () => {
    const { task: a } = await create(alice(), { title: 'old', status: 'done' });
    await create(alice(), { title: 'new', status: 'done' });
    await create(alice(), { title: 'open' });
    await t.db.execute(
      sql`update tasks set completed_at = '2025-01-01T00:00:00Z' where id = ${a.id}`,
    );
    const after = await list(alice(), { completedAfter: '2025-06-01T00:00:00.000Z' });
    expect(titles(after)).toEqual(['new']);
    const before = await list(alice(), { completedBefore: '2025-06-01T00:00:00.000Z' });
    expect(titles(before)).toEqual(['old']);
  });

  it('hides archived tasks by default and shows only them with archived', async () => {
    const { task } = await create(alice(), { title: 'old' });
    await create(alice(), { title: 'live' });
    await registry.run(alice(), 'tasks.archive', { id: task.id });
    expect(titles(await list(alice()))).toEqual(['live']);
    expect(titles(await list(alice(), { archived: 'true' }))).toEqual(['old']);
  });

  it('refuses bad new filters', async () => {
    for (const input of [{ priority: 9 }, { tagId: 'x' }, { dueFrom: 'soon' }, { parent: 'x' }]) {
      expect(await failure(registry.run(alice(), 'tasks.list', input))).toBeInstanceOf(ZodError);
    }
  });
});

describe('tasks.complete with the Feature 3 stubs', () => {
  it('still completes a task that has a recurrence rule', async () => {
    const { task } = await create(alice(), { title: 'weekly' });
    await t.db.execute(sql`update tasks set recurrence_rule = 'FREQ=WEEKLY' where id = ${task.id}`);
    const done = await registry.run(alice(), 'tasks.complete', { id: task.id });
    expect(done.data).toMatchObject({ status: 'done' });
  });
});

describe('all-day due dates are always stored as the start of the India day', () => {
  it('normalises on create', async () => {
    const { task } = await create(alice(), {
      title: 'All day',
      dueAt: '2025-10-07T10:00:00.000Z', // 15:30 India time on 7 October
      dueAllDay: true,
    });
    expect(task).toMatchObject({ dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true });
  });

  it('normalises on update, also when only the date changes on an all-day task', async () => {
    const { task } = await create(alice(), {
      title: 'All day',
      dueAt: '2025-10-06T18:30:00.000Z',
      dueAllDay: true,
    });
    const moved = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      dueAt: '2025-10-09T05:00:00.000Z', // 10:30 on 9 October India time
    });
    expect(moved.data).toMatchObject({ dueAt: '2025-10-08T18:30:00.000Z', dueAllDay: true });
    const both = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      dueAt: '2025-10-10T21:00:00.000Z', // 02:30 on 11 October India time
      dueAllDay: true,
    });
    expect(both.data).toMatchObject({ dueAt: '2025-10-10T18:30:00.000Z' });
  });

  it('leaves timed tasks alone', async () => {
    const { task } = await create(alice(), { title: 'Timed', dueAt: '2025-10-07T10:00:00.000Z' });
    expect(task.dueAt).toBe('2025-10-07T10:00:00.000Z');
  });
});
