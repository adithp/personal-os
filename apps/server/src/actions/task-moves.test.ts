import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

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
  position: number;
  dueAt: string | null;
  dueAllDay: boolean;
  completedAt: string | null;
}

async function create(ctx: ActionContext, title: string, extra: Record<string, unknown> = {}) {
  return (await registry.run(ctx, 'tasks.create', { title, ...extra })).data as Item;
}

async function move(ctx: ActionContext, input: Record<string, unknown>) {
  const outcome = await registry.run(ctx, 'tasks.move', input);
  return { task: outcome.data as Item, undo: outcome.undo };
}

/** Titles of the top-level (or one parent's) tasks in manual order. */
async function order(ctx: ActionContext, parentTaskId?: string): Promise<string[]> {
  const input = { parent: parentTaskId ?? 'none' };
  const items = (await registry.run(ctx, 'tasks.list', input)).data as Item[];
  return items.sort((a, b) => a.position - b.position).map((item) => item.title);
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

async function four() {
  const a = await create(alice(), 'A');
  const b = await create(alice(), 'B');
  const c = await create(alice(), 'C');
  const d = await create(alice(), 'D');
  return { a, b, c, d };
}

describe('tasks.move position', () => {
  it('is a write action', () => {
    expect(registry.permissionOf('tasks.move')).toBe('write');
  });

  it('puts the task between two neighbours', async () => {
    const { a, b, d } = await four();
    const { task } = await move(alice(), { id: d.id, afterId: a.id, beforeId: b.id });
    expect(task.position).toBe((a.position + b.position) / 2);
    expect(await order(alice())).toEqual(['A', 'D', 'B', 'C']);
  });

  it('with only afterId goes right after that task', async () => {
    const { a, d } = await four();
    await move(alice(), { id: d.id, afterId: a.id });
    expect(await order(alice())).toEqual(['A', 'D', 'B', 'C']);
  });

  it('with only afterId on a middle task goes between it and the next one', async () => {
    const { a, c, d } = await four();
    const { task } = await move(alice(), { id: a.id, afterId: c.id });
    expect(await order(alice())).toEqual(['B', 'C', 'A', 'D']);
    expect(task.position).toBe((c.position + d.position) / 2);
  });

  it('with only afterId on the last sibling adds one step', async () => {
    const { a, d } = await four();
    const { task } = await move(alice(), { id: a.id, afterId: d.id });
    expect(task.position).toBe(d.position + 1024);
  });

  it('with only beforeId goes right before that task', async () => {
    const { c, d } = await four();
    await move(alice(), { id: d.id, beforeId: c.id });
    expect(await order(alice())).toEqual(['A', 'B', 'D', 'C']);
  });

  it('with only beforeId on the first task goes to the top', async () => {
    const { a, d } = await four();
    const { task } = await move(alice(), { id: d.id, beforeId: a.id });
    expect(task.position).toBe(a.position - 1024);
    expect(await order(alice())).toEqual(['D', 'A', 'B', 'C']);
  });

  it('ignores the moved task itself when it looks for the next sibling', async () => {
    const { a, b, c } = await four();
    // b sits right below a: moving b after a must not use b as the upper bound
    const { task } = await move(alice(), { id: b.id, afterId: a.id });
    expect(task.position).toBe((a.position + c.position) / 2);
  });

  it('rebalances the siblings when the neighbours are almost equal', async () => {
    const { a, b, c } = await four();
    await t.db.execute(sql`update tasks set position = 1 where id = ${a.id}`);
    await t.db.execute(sql`update tasks set position = 1.0000000001 where id = ${b.id}`);
    const { task } = await move(alice(), { id: c.id, afterId: a.id, beforeId: b.id });
    expect(task.position).toBe(1536);
    expect(await order(alice())).toEqual(['A', 'C', 'B', 'D']);
    const rows = await t.db.execute(sql`select title, position from tasks order by position`);
    expect(rows.rows.map((row) => row.position)).toEqual([1024, 1536, 2048, 3072]);
  });

  it('keeps the position when there are no neighbours', async () => {
    const { a } = await four();
    const { task } = await move(alice(), { id: a.id, status: 'doing' });
    expect(task.position).toBe(a.position);
  });

  it('orders subtasks only among siblings of the same parent', async () => {
    const { a } = await four();
    const s1 = await create(alice(), 'S1', { parentTaskId: a.id });
    await create(alice(), 'S2', { parentTaskId: a.id });
    const s3 = await create(alice(), 'S3', { parentTaskId: a.id });
    await move(alice(), { id: s3.id, beforeId: s1.id });
    expect(await order(alice(), a.id)).toEqual(['S3', 'S1', 'S2']);
    expect(await order(alice())).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('tasks.move status and dates', () => {
  it('changes the status, and done sets completedAt while reopening clears it', async () => {
    const { a } = await four();
    expect((await move(alice(), { id: a.id, status: 'doing' })).task.status).toBe('doing');
    const done = (await move(alice(), { id: a.id, status: 'done' })).task;
    expect(done).toMatchObject({ status: 'done' });
    expect(done.completedAt).not.toBeNull();
    const reopened = (await move(alice(), { id: a.id, status: 'todo' })).task;
    expect(reopened).toMatchObject({ status: 'todo', completedAt: null });
  });

  it('moves and changes the status in one step', async () => {
    const { a, b, d } = await four();
    const { task } = await move(alice(), {
      id: d.id,
      status: 'doing',
      afterId: a.id,
      beforeId: b.id,
    });
    expect(task).toMatchObject({ status: 'doing', position: (a.position + b.position) / 2 });
  });

  it('normalises an all-day due date to the start of the India day', async () => {
    const { a } = await four();
    const { task } = await move(alice(), {
      id: a.id,
      dueAt: '2025-10-07T10:00:00.000Z',
      dueAllDay: true,
    });
    expect(task).toMatchObject({ dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true });
  });

  // The blocked refusal and the recurring copy are not tested here: blockers and recurrence are
  // contract stubs until Feature 3, and both rules live in applyChange, shared with tasks.update.
});

describe('tasks.move undo', () => {
  it('puts back the position and the status', async () => {
    const { a, b, d } = await four();
    const { undo } = await move(alice(), {
      id: d.id,
      status: 'doing',
      afterId: a.id,
      beforeId: b.id,
    });
    expect(undo).toMatchObject({ action: 'tasks.update' });
    expect(undo?.input).toMatchObject({ id: d.id, status: 'todo', position: d.position });
    if (!undo) throw new Error('expected an undo');
    await registry.run(alice(), undo.action, undo.input);
    const restored = (await registry.run(alice(), 'tasks.get', { id: d.id })).data as Item;
    expect(restored).toMatchObject({ status: 'todo', position: d.position });
    expect(await order(alice())).toEqual(['A', 'B', 'C', 'D']);
  });

  it('is null when nothing changes', async () => {
    const { a } = await four();
    const { undo } = await move(alice(), { id: a.id, status: 'todo' });
    expect(undo).toBeNull();
  });
});

describe('tasks.move errors', () => {
  it('rejects a move with nothing to change', async () => {
    const { a } = await four();
    expect(await failure(registry.run(alice(), 'tasks.move', { id: a.id }))).toBeInstanceOf(
      ZodError,
    );
  });

  it('404s an unknown task and an unknown neighbour', async () => {
    const { a } = await four();
    const unknown = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';
    const missingTask = await failure(
      registry.run(alice(), 'tasks.move', { id: unknown, status: 'doing' }),
    );
    const missingNeighbour = await failure(
      registry.run(alice(), 'tasks.move', { id: a.id, afterId: unknown }),
    );
    expect(missingTask).toMatchObject({ statusCode: 404, code: 'not_found' });
    expect(missingNeighbour).toMatchObject({ statusCode: 404, code: 'not_found' });
  });

  it('404s a deleted neighbour', async () => {
    const { a, b } = await four();
    await registry.run(alice(), 'tasks.delete', { id: b.id });
    const error = await failure(registry.run(alice(), 'tasks.move', { id: a.id, afterId: b.id }));
    expect(error).toMatchObject({ statusCode: 404 });
  });

  it('400s a neighbour with another parent and the task itself', async () => {
    const { a, b } = await four();
    const sub = await create(alice(), 'Sub', { parentTaskId: a.id });
    const otherParent = await failure(
      registry.run(alice(), 'tasks.move', { id: sub.id, afterId: b.id }),
    );
    const itself = await failure(registry.run(alice(), 'tasks.move', { id: a.id, afterId: a.id }));
    expect(otherParent).toBeInstanceOf(HttpError);
    expect(otherParent).toMatchObject({ statusCode: 400, code: 'validation_error' });
    expect(itself).toMatchObject({ statusCode: 400, code: 'validation_error' });
  });

  it('400s when afterId is not above beforeId', async () => {
    const { a, b } = await four();
    const same = await failure(
      registry.run(alice(), 'tasks.move', { id: a.id, afterId: b.id, beforeId: b.id }),
    );
    expect(same).toMatchObject({ statusCode: 400, code: 'validation_error' });
    const reversed = await failure(
      registry.run(alice(), 'tasks.move', {
        id: (await create(alice(), 'E')).id,
        afterId: b.id,
        beforeId: a.id,
      }),
    );
    expect(reversed).toMatchObject({ statusCode: 400, code: 'validation_error' });
  });

  it('leaves positions unchanged when the move is refused', async () => {
    const { a, b } = await four();
    await failure(registry.run(alice(), 'tasks.move', { id: a.id, afterId: b.id, beforeId: a.id }));
    expect(await order(alice())).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('tasks.move user isolation', () => {
  it('cannot move another user task or use their tasks as neighbours', async () => {
    const mine = await create(alice(), 'Mine');
    const theirs = await create(bob(), 'Theirs');
    const moveTheirs = await failure(
      registry.run(alice(), 'tasks.move', { id: theirs.id, status: 'doing' }),
    );
    const useTheirs = await failure(
      registry.run(alice(), 'tasks.move', { id: mine.id, afterId: theirs.id }),
    );
    expect(moveTheirs).toMatchObject({ statusCode: 404, code: 'not_found' });
    expect(useTheirs).toMatchObject({ statusCode: 404, code: 'not_found' });
    const stillTheirs = (await registry.run(bob(), 'tasks.get', { id: theirs.id })).data as Item;
    expect(stillTheirs).toMatchObject({ status: 'todo', position: theirs.position });
  });
});
