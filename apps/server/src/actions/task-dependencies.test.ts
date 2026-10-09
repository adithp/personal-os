import { links } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';
import { assertNotBlocked, loadBlockers } from './task-dependencies';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';
const UNKNOWN = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

let t: TestDb;
const registry = createRegistry();

const context = (userId: string): ActionContext => ({
  scope: createUserScope(t.db, userId),
  source: 'ui',
  confirmed: true,
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
  blockedBy: { id: string; title: string }[];
}

async function create(ctx: ActionContext, title: string): Promise<Item> {
  return (await registry.run(ctx, 'tasks.create', { title })).data as Item;
}

async function get(ctx: ActionContext, id: string): Promise<Item> {
  return (await registry.run(ctx, 'tasks.get', { id })).data as Item;
}

const block = (ctx: ActionContext, blocker: Item, blocked: Item) =>
  registry.run(ctx, 'tasks.addBlocker', { id: blocked.id, blockerId: blocker.id });

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('tasks.addBlocker', () => {
  it('has the write permission level', () => {
    expect(registry.permissionOf('tasks.addBlocker')).toBe('write');
    expect(registry.permissionOf('tasks.removeBlocker')).toBe('write');
  });

  it('makes the blocker block the task and returns the blocked task with details', async () => {
    const a = await create(alice(), 'Write draft');
    const b = await create(alice(), 'Publish');
    const outcome = await block(alice(), a, b);
    expect((outcome.data as Item).blockedBy).toEqual([{ id: a.id, title: 'Write draft' }]);
    expect(outcome.undo).toEqual({
      action: 'tasks.removeBlocker',
      input: { id: b.id, blockerId: a.id },
    });
    expect((await get(alice(), a.id)).blockedBy).toEqual([]);
  });

  it('allows adding the same blocker again and changes nothing', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    await block(alice(), a, b);
    const again = await block(alice(), a, b);
    expect(again.undo).toBeNull();
    expect((again.data as Item).blockedBy).toHaveLength(1);
    expect(await t.db.select().from(links)).toHaveLength(1);
  });

  it('refuses a task blocking itself', async () => {
    const a = await create(alice(), 'A');
    const error = await failure(block(alice(), a, a));
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 400, code: 'validation_error' });
  });

  it('refuses a direct cycle', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    await block(alice(), a, b);
    const error = await failure(block(alice(), b, a));
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'circular_dependency',
      message: 'That would make the tasks wait for each other',
    });
  });

  it('refuses a cycle through a chain of tasks', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    const c = await create(alice(), 'C');
    await block(alice(), a, b);
    await block(alice(), b, c);
    const error = await failure(block(alice(), c, a));
    expect(error).toMatchObject({ statusCode: 409, code: 'circular_dependency' });
    expect(await t.db.select().from(links)).toHaveLength(2);
  });

  it('allows a task to be blocked by two tasks (no cycle)', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    const c = await create(alice(), 'C');
    await block(alice(), a, c);
    await block(alice(), b, c);
    expect((await get(alice(), c.id)).blockedBy.map((x) => x.title)).toEqual(['A', 'B']);
  });

  it('answers 404 for unknown or deleted tasks', async () => {
    const a = await create(alice(), 'A');
    const gone = await create(alice(), 'Gone');
    await registry.run(alice(), 'tasks.delete', { id: gone.id });
    const unknownBlocker = await failure(
      registry.run(alice(), 'tasks.addBlocker', { id: a.id, blockerId: UNKNOWN }),
    );
    const unknownTask = await failure(
      registry.run(alice(), 'tasks.addBlocker', { id: UNKNOWN, blockerId: a.id }),
    );
    const deleted = await failure(block(alice(), gone, a));
    for (const error of [unknownBlocker, unknownTask, deleted]) {
      expect(error).toMatchObject({ statusCode: 404, code: 'not_found' });
    }
  });

  it('never lets one user link or read the tasks of another user', async () => {
    const mine = await create(alice(), 'Mine');
    const theirs = await create(bob(), 'Theirs');
    const asBob = await failure(block(bob(), mine, theirs));
    const asAlice = await failure(block(alice(), theirs, mine));
    expect(asBob).toMatchObject({ statusCode: 404 });
    expect(asAlice).toMatchObject({ statusCode: 404 });
    expect(await t.db.select().from(links)).toHaveLength(0);
  });

  it('rejects bad input with a ZodError', async () => {
    const error = await failure(
      registry.run(alice(), 'tasks.addBlocker', { id: 'nope', blockerId: UNKNOWN }),
    );
    expect(error).toBeInstanceOf(ZodError);
  });

  it('undo removes the blocker again', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    const { undo } = await block(alice(), a, b);
    if (!undo) throw new Error('expected an undo');
    await registry.run(alice(), undo.action, undo.input);
    expect((await get(alice(), b.id)).blockedBy).toEqual([]);
  });
});

describe('tasks.removeBlocker', () => {
  it('removes the blocker, and the pair can be linked again afterwards', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    await block(alice(), a, b);
    const outcome = await registry.run(alice(), 'tasks.removeBlocker', {
      id: b.id,
      blockerId: a.id,
    });
    expect((outcome.data as Item).blockedBy).toEqual([]);
    expect(outcome.undo).toEqual({
      action: 'tasks.addBlocker',
      input: { id: b.id, blockerId: a.id },
    });
    await block(alice(), a, b);
    expect((await get(alice(), b.id)).blockedBy).toHaveLength(1);
  });

  it('changes nothing when the link is not there', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    const outcome = await registry.run(alice(), 'tasks.removeBlocker', {
      id: b.id,
      blockerId: a.id,
    });
    expect(outcome.undo).toBeNull();
  });

  it('answers 404 for an unknown task and never touches another user links', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    await block(alice(), a, b);
    const unknown = await failure(
      registry.run(alice(), 'tasks.removeBlocker', { id: UNKNOWN, blockerId: a.id }),
    );
    const asBob = await failure(
      registry.run(bob(), 'tasks.removeBlocker', { id: b.id, blockerId: a.id }),
    );
    expect(unknown).toMatchObject({ statusCode: 404 });
    expect(asBob).toMatchObject({ statusCode: 404 });
    expect((await get(alice(), b.id)).blockedBy).toHaveLength(1);
  });

  it('undo puts the blocker back', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    await block(alice(), a, b);
    const { undo } = await registry.run(alice(), 'tasks.removeBlocker', {
      id: b.id,
      blockerId: a.id,
    });
    if (!undo) throw new Error('expected an undo');
    await registry.run(alice(), undo.action, undo.input);
    expect((await get(alice(), b.id)).blockedBy).toHaveLength(1);
  });
});

describe('blocking enforcement', () => {
  async function pair() {
    const a = await create(alice(), 'Blocker');
    const b = await create(alice(), 'Blocked');
    await block(alice(), a, b);
    return { a, b };
  }

  it('refuses tasks.complete, tasks.update to done, and tasks.move into Done', async () => {
    const { b } = await pair();
    const attempts = [
      () => registry.run(alice(), 'tasks.complete', { id: b.id }),
      () => registry.run(alice(), 'tasks.update', { id: b.id, status: 'done' }),
      () => registry.run(alice(), 'tasks.move', { id: b.id, status: 'done' }),
    ];
    for (const attempt of attempts) {
      expect(await failure(attempt())).toMatchObject({
        statusCode: 409,
        code: 'blocked',
        message: 'Blocked by: Blocker',
      });
    }
    expect((await get(alice(), b.id)).status).toBe('todo');
  });

  it('lists every blocker by title in the message', async () => {
    const { b } = await pair();
    const z = await create(alice(), 'Another');
    await block(alice(), z, b);
    const error = await failure(registry.run(alice(), 'tasks.complete', { id: b.id }));
    expect(error).toMatchObject({ message: 'Blocked by: Another, Blocker' });
  });

  it('shows blockedBy in tasks.list and tasks.get', async () => {
    const { a, b } = await pair();
    const listed = (await registry.run(alice(), 'tasks.list', {})).data as Item[];
    expect(listed.find((x) => x.id === b.id)?.blockedBy).toEqual([{ id: a.id, title: 'Blocker' }]);
    expect(listed.find((x) => x.id === a.id)?.blockedBy).toEqual([]);
    expect((await get(alice(), b.id)).blockedBy).toHaveLength(1);
  });

  it('unblocks when the blocker is finished', async () => {
    const { a, b } = await pair();
    await registry.run(alice(), 'tasks.complete', { id: a.id });
    expect((await get(alice(), b.id)).blockedBy).toEqual([]);
    await registry.run(alice(), 'tasks.complete', { id: b.id });
    expect((await get(alice(), b.id)).status).toBe('done');
  });

  it('unblocks when the blocker is deleted, and blocks again when restored', async () => {
    const { a, b } = await pair();
    await registry.run(alice(), 'tasks.delete', { id: a.id });
    expect((await get(alice(), b.id)).blockedBy).toEqual([]);
    await registry.run(alice(), 'tasks.restore', { id: a.id });
    expect((await get(alice(), b.id)).blockedBy).toHaveLength(1);
  });

  it('still blocks when the blocker is archived', async () => {
    const { a, b } = await pair();
    await registry.run(alice(), 'tasks.archive', { id: a.id });
    expect((await get(alice(), b.id)).blockedBy).toHaveLength(1);
    expect(await failure(registry.run(alice(), 'tasks.complete', { id: b.id }))).toMatchObject({
      code: 'blocked',
    });
  });

  it('unblocks when the link is removed', async () => {
    const { a, b } = await pair();
    await registry.run(alice(), 'tasks.removeBlocker', { id: b.id, blockerId: a.id });
    await registry.run(alice(), 'tasks.complete', { id: b.id });
    expect((await get(alice(), b.id)).status).toBe('done');
  });
});

describe('loadBlockers and assertNotBlocked', () => {
  it('leaves out tasks without blockers and handles an empty list', async () => {
    const a = await create(alice(), 'A');
    const b = await create(alice(), 'B');
    await block(alice(), a, b);
    const scope = createUserScope(t.db, ALICE);
    expect(await loadBlockers(scope, [])).toEqual(new Map());
    const map = await loadBlockers(scope, [a.id, b.id]);
    expect([...map.keys()]).toEqual([b.id]);
    await expect(assertNotBlocked(scope, a.id)).resolves.toBeUndefined();
  });

  it('sorts blockers by title and never shows another user blockers', async () => {
    const x = await create(alice(), 'x-task');
    const m = await create(alice(), 'M-task');
    const target = await create(alice(), 'Target');
    await block(alice(), x, target);
    await block(alice(), m, target);
    const map = await loadBlockers(createUserScope(t.db, ALICE), [target.id]);
    expect(map.get(target.id)?.map((item) => item.title)).toEqual(['M-task', 'x-task']);
    expect((await loadBlockers(createUserScope(t.db, BOB), [target.id])).size).toBe(0);
  });
});
