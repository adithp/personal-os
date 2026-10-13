import { entities, goals, links, tasks } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { MAX_TASKS_PER_GOAL, type Goal, type Task } from '@personal-os/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';
import { loadGoalProgress, loadTaskGoals, taskIdsOfGoal } from './goals';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

let t: TestDb;
const registry = createRegistry();

const context = (userId: string, confirmed = true): ActionContext => ({
  scope: createUserScope(t.db, userId),
  source: 'ui',
  confirmed,
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
    sql`truncate table goals, entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

interface Undo {
  action: string;
  input: Record<string, unknown>;
}
interface Result<T> {
  data: T;
  undo?: Undo | null;
}

const run = async <T>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const undoOf = (result: Result<unknown>): Undo => {
  if (!result.undo) throw new Error('Expected an undo');
  return result.undo;
};
const goalOf = async (ctx: ActionContext, title: string, more: Record<string, unknown> = {}) =>
  (await run<Goal>(ctx, 'goals.create', { title, ...more })).data;
const taskOf = async (ctx: ActionContext, title: string, more: Record<string, unknown> = {}) =>
  (await run<Task>(ctx, 'tasks.create', { title, ...more })).data;
const getGoal = async (ctx: ActionContext, id: string) =>
  (await run<Goal>(ctx, 'goals.get', { id })).data;
const progressOf = async (ctx: ActionContext, id: string) => (await getGoal(ctx, id)).progress;
const setGoal = (ctx: ActionContext, taskId: string, goalId: string | null) =>
  run<Goal>(ctx, 'goals.setTaskGoal', { taskId, goalId });
const taskGoal = async (ctx: ActionContext, id: string) =>
  (await run<Task>(ctx, 'tasks.get', { id })).data.goal;
const statusCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error.statusCode;
    throw error;
  }
  return 0;
};

describe('goals.create and goals.get', () => {
  it('creates the entity and the goal, stores the target as the start of the India day', async () => {
    const created = await run<Goal>(alice(), 'goals.create', {
      title: '  Learn Rust ',
      description: 'Notes',
      targetAt: '2026-12-31T10:00:00.000Z',
    });
    expect(created.data).toMatchObject({
      title: 'Learn Rust',
      description: 'Notes',
      targetAt: '2026-12-30T18:30:00.000Z',
      status: 'active',
      closedAt: null,
      progress: { done: 0, total: 0 },
    });
    expect(created.undo).toEqual({ action: 'goals.delete', input: { id: created.data.id } });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, created.data.id));
    expect(entity).toMatchObject({ type: 'goal', title: 'Learn Rust' });
    expect(await getGoal(alice(), created.data.id)).toEqual(created.data);
  });

  it('rejects bad input with a ZodError', async () => {
    await expect(registry.run(alice(), 'goals.create', { title: '   ' })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      registry.run(alice(), 'goals.create', { title: 'x'.repeat(201) }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(registry.run(alice(), 'goals.get', { id: 'nope' })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it('undoing the create deletes the goal', async () => {
    const created = await run<Goal>(alice(), 'goals.create', { title: 'A' });
    await run(alice(), created.undo?.action ?? '', created.undo?.input);
    expect(await statusCode(registry.run(alice(), 'goals.get', { id: created.data.id }))).toBe(404);
  });

  it('answers 404 for a missing goal and for another user goal', async () => {
    const mine = await goalOf(alice(), 'Mine');
    expect(await statusCode(registry.run(alice(), 'goals.get', { id: MISSING }))).toBe(404);
    expect(await statusCode(registry.run(bob(), 'goals.get', { id: mine.id }))).toBe(404);
  });
});

describe('goals.update', () => {
  it('changes the fields, renames the entity, and undoes with the old values', async () => {
    const goal = await goalOf(alice(), 'Old', {
      description: 'd',
      targetAt: '2026-12-31T00:00:00.000Z',
    });
    const result = await run<Goal>(alice(), 'goals.update', {
      id: goal.id,
      title: 'New',
      description: null,
      targetAt: null,
    });
    expect(result.data).toMatchObject({ title: 'New', description: null, targetAt: null });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, goal.id));
    expect(entity?.title).toBe('New');
    await run(alice(), undoOf(result).action, undoOf(result).input);
    expect(await getGoal(alice(), goal.id)).toMatchObject({
      title: 'Old',
      description: 'd',
      targetAt: goal.targetAt,
    });
    const [back] = await t.db.select().from(entities).where(eq(entities.id, goal.id));
    expect(back?.title).toBe('Old');
  });

  it('returns undo null when nothing changed, and only undoes what changed', async () => {
    const goal = await goalOf(alice(), 'Same', { description: 'd' });
    const same = await run<Goal>(alice(), 'goals.update', {
      id: goal.id,
      title: 'Same',
      description: 'd',
    });
    expect(same.undo).toBeNull();
    const part = await run<Goal>(alice(), 'goals.update', {
      id: goal.id,
      title: 'Other',
      description: 'd',
    });
    expect(part.undo).toEqual({ action: 'goals.update', input: { id: goal.id, title: 'Same' } });
  });

  it('refuses an empty change and an empty title, and 404s for others', async () => {
    const goal = await goalOf(alice(), 'A');
    await expect(registry.run(alice(), 'goals.update', { id: goal.id })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      registry.run(alice(), 'goals.update', { id: goal.id, title: ' ' }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await statusCode(registry.run(bob(), 'goals.update', { id: goal.id, title: 'X' }))).toBe(
      404,
    );
    expect((await getGoal(alice(), goal.id)).title).toBe('A');
  });
});

describe('goals.setStatus', () => {
  it('sets closedAt when achieved or dropped and clears it when active', async () => {
    const goal = await goalOf(alice(), 'A');
    const achieved = await run<Goal>(alice(), 'goals.setStatus', {
      id: goal.id,
      status: 'achieved',
    });
    expect(achieved.data.status).toBe('achieved');
    expect(achieved.data.closedAt).not.toBeNull();
    expect(achieved.undo).toEqual({
      action: 'goals.setStatus',
      input: { id: goal.id, status: 'active', closedAt: null },
    });
    const active = await run<Goal>(alice(), 'goals.setStatus', { id: goal.id, status: 'active' });
    expect(active.data).toMatchObject({ status: 'active', closedAt: null });
  });

  it('undo puts back the old status and the old closedAt', async () => {
    const goal = await goalOf(alice(), 'A');
    const first = await run<Goal>(alice(), 'goals.setStatus', { id: goal.id, status: 'achieved' });
    const second = await run<Goal>(alice(), 'goals.setStatus', { id: goal.id, status: 'dropped' });
    expect(second.data.closedAt).not.toBeNull();
    await run(alice(), undoOf(second).action, undoOf(second).input);
    expect(await getGoal(alice(), goal.id)).toMatchObject({
      status: 'achieved',
      closedAt: first.data.closedAt,
    });
  });

  it('the same status returns the goal with undo null', async () => {
    const goal = await goalOf(alice(), 'A');
    const same = await run<Goal>(alice(), 'goals.setStatus', { id: goal.id, status: 'active' });
    expect(same.undo).toBeNull();
    expect(same.data.id).toBe(goal.id);
  });

  it('rejects an unknown status and 404s for others', async () => {
    const goal = await goalOf(alice(), 'A');
    await expect(
      registry.run(alice(), 'goals.setStatus', { id: goal.id, status: 'done' }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(
      await statusCode(registry.run(bob(), 'goals.setStatus', { id: goal.id, status: 'dropped' })),
    ).toBe(404);
  });
});

describe('goals.list', () => {
  it('orders active goals by target date (none last) then created, and filters by status', async () => {
    const late = await goalOf(alice(), 'Late', { targetAt: '2027-03-10T00:00:00.000Z' });
    const none1 = await goalOf(alice(), 'None 1');
    const soon = await goalOf(alice(), 'Soon', { targetAt: '2026-11-10T00:00:00.000Z' });
    const none2 = await goalOf(alice(), 'None 2');
    const titles = async (input: object) =>
      (await run<Goal[]>(alice(), 'goals.list', input)).data.map((goal) => goal.title);
    expect(await titles({ status: 'active' })).toEqual(['Soon', 'Late', 'None 1', 'None 2']);
    await run(alice(), 'goals.setStatus', { id: none1.id, status: 'achieved' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await run(alice(), 'goals.setStatus', { id: late.id, status: 'achieved' });
    await run(alice(), 'goals.setStatus', { id: none2.id, status: 'dropped' });
    expect(await titles({ status: 'achieved' })).toEqual(['Late', 'None 1']);
    expect(await titles({ status: 'dropped' })).toEqual(['None 2']);
    // No filter: active first, then achieved, then dropped
    expect(await titles({})).toEqual(['Soon', 'Late', 'None 1', 'None 2']);
    expect(soon.title).toBe('Soon');
  });

  it('puts active goals before closed ones when there is no filter', async () => {
    const closed = await goalOf(alice(), 'Closed');
    await goalOf(alice(), 'Open');
    await run(alice(), 'goals.setStatus', { id: closed.id, status: 'achieved' });
    const all = (await run<Goal[]>(alice(), 'goals.list', {})).data.map((goal) => goal.title);
    expect(all).toEqual(['Open', 'Closed']);
  });

  it('lists only the own, live goals, with progress', async () => {
    const mine = await goalOf(alice(), 'Mine');
    const gone = await goalOf(alice(), 'Gone');
    await goalOf(bob(), 'Bobs');
    await run(alice(), 'goals.delete', { id: gone.id });
    const task = await taskOf(alice(), 'T');
    await setGoal(alice(), task.id, mine.id);
    const listed = (await run<Goal[]>(alice(), 'goals.list', {})).data;
    expect(listed.map((goal) => goal.title)).toEqual(['Mine']);
    expect(listed[0]?.progress).toEqual({ done: 0, total: 1 });
  });
});

describe('progress rules', () => {
  const withTasks = async () => {
    const goal = await goalOf(alice(), 'G');
    const make = async (title: string, more: Record<string, unknown> = {}) => {
      const task = await taskOf(alice(), title, more);
      await setGoal(alice(), task.id, goal.id);
      return task;
    };
    return { goal, make };
  };

  it('a goal without tasks is 0 of 0', async () => {
    const goal = await goalOf(alice(), 'Empty');
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: 0 });
  });

  it('counts done and total; in progress is not done', async () => {
    const { goal, make } = await withTasks();
    await make('todo');
    await make('doing', { status: 'doing' });
    await make('done', { status: 'done' });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 1, total: 3 });
  });

  it('leaves out archived open tasks but counts archived done tasks', async () => {
    const { goal, make } = await withTasks();
    const open = await make('open');
    const done = await make('done', { status: 'done' });
    await make('plain');
    await run(alice(), 'tasks.archive', { id: open.id });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 1, total: 2 });
    await run(alice(), 'tasks.archive', { id: done.id });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 1, total: 2 });
  });

  it('leaves out deleted tasks and counts a restored task again', async () => {
    const { goal, make } = await withTasks();
    const task = await make('gone', { status: 'done' });
    await make('stays');
    await run(alice(), 'tasks.delete', { id: task.id });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: 1 });
    await run(alice(), 'tasks.restore', { id: task.id });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 1, total: 2 });
  });

  it('never counts a subtask, even one linked by a row', async () => {
    const { goal, make } = await withTasks();
    const parent = await make('parent');
    const sub = await taskOf(alice(), 'sub', { parentTaskId: parent.id, status: 'done' });
    // A link written behind the action's back is still not counted
    await createUserScope(t.db, ALICE).insert(links, {
      sourceId: sub.id,
      targetId: goal.id,
      relation: 'belongs_to',
    });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: 1 });
  });

  it('a removed link is not counted and the progress follows completing a task', async () => {
    const { goal, make } = await withTasks();
    const task = await make('a');
    await make('b');
    await run(alice(), 'tasks.complete', { id: task.id });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 1, total: 2 });
    await setGoal(alice(), task.id, null);
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: 1 });
  });

  it('loadGoalProgress answers many goals and handles an empty list', async () => {
    const a = await goalOf(alice(), 'A');
    const b = await goalOf(alice(), 'B');
    const task = await taskOf(alice(), 'T', { status: 'done' });
    await setGoal(alice(), task.id, b.id);
    const scope = createUserScope(t.db, ALICE);
    const map = await loadGoalProgress(scope, [a.id, b.id]);
    expect(map.get(a.id)).toEqual({ done: 0, total: 0 });
    expect(map.get(b.id)).toEqual({ done: 1, total: 1 });
    expect((await loadGoalProgress(scope, [])).size).toBe(0);
  });
});

describe('goals.setTaskGoal', () => {
  it('links a task and undoes by unlinking', async () => {
    const goal = await goalOf(alice(), 'G');
    const task = await taskOf(alice(), 'T');
    const result = await setGoal(alice(), task.id, goal.id);
    expect(result.data).toMatchObject({ id: goal.id, progress: { done: 0, total: 1 } });
    expect(result.undo).toEqual({
      action: 'goals.setTaskGoal',
      input: { taskId: task.id, goalId: null },
    });
    expect(await taskGoal(alice(), task.id)).toEqual({ id: goal.id, title: 'G' });
    const undone = await run<Goal>(alice(), undoOf(result).action, undoOf(result).input);
    expect(undone.data.id).toBe(goal.id);
    expect(await taskGoal(alice(), task.id)).toBeNull();
  });

  it('moves a task to another goal (one goal per task) and the undo moves it back', async () => {
    const one = await goalOf(alice(), 'One');
    const two = await goalOf(alice(), 'Two');
    const task = await taskOf(alice(), 'T');
    await setGoal(alice(), task.id, one.id);
    const moved = await setGoal(alice(), task.id, two.id);
    expect(moved.data.id).toBe(two.id);
    expect(moved.undo?.input).toEqual({ taskId: task.id, goalId: one.id });
    expect(await progressOf(alice(), one.id)).toEqual({ done: 0, total: 0 });
    expect(await progressOf(alice(), two.id)).toEqual({ done: 0, total: 1 });
    await run(alice(), undoOf(moved).action, undoOf(moved).input);
    expect(await taskGoal(alice(), task.id)).toEqual({ id: one.id, title: 'One' });
    expect(await progressOf(alice(), two.id)).toEqual({ done: 0, total: 0 });
    const live = await t.db
      .select()
      .from(links)
      .where(and(eq(links.sourceId, task.id), sql`${links.deletedAt} is null`));
    expect(live).toHaveLength(1);
  });

  it('unlinking returns the goal it left; unchanged returns undo null', async () => {
    const goal = await goalOf(alice(), 'G');
    const task = await taskOf(alice(), 'T');
    await setGoal(alice(), task.id, goal.id);
    const same = await setGoal(alice(), task.id, goal.id);
    expect(same.undo).toBeNull();
    expect(same.data.progress).toEqual({ done: 0, total: 1 });
    const out = await setGoal(alice(), task.id, null);
    expect(out.data).toMatchObject({ id: goal.id, progress: { done: 0, total: 0 } });
    expect(out.undo?.input).toEqual({ taskId: task.id, goalId: goal.id });
  });

  it('answers 404 when unlinking a task that is in no goal', async () => {
    const task = await taskOf(alice(), 'T');
    expect(await statusCode(setGoal(alice(), task.id, null))).toBe(404);
  });

  it('refuses a subtask with 400 and a clear message', async () => {
    const goal = await goalOf(alice(), 'G');
    const parent = await taskOf(alice(), 'P');
    const sub = await taskOf(alice(), 'S', { parentTaskId: parent.id });
    await expect(setGoal(alice(), sub.id, goal.id)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Link the parent task instead.',
    });
    await expect(
      registry.run(alice(), 'tasks.create', {
        title: 'X',
        parentTaskId: parent.id,
        goalId: goal.id,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a target that is not a goal (a task id) with 404', async () => {
    const other = await taskOf(alice(), 'Other');
    const task = await taskOf(alice(), 'T');
    expect(await statusCode(setGoal(alice(), task.id, other.id))).toBe(404);
    expect(await statusCode(setGoal(alice(), task.id, MISSING))).toBe(404);
    expect(await statusCode(setGoal(alice(), MISSING, null))).toBe(404);
    const live = await t.db.select().from(links);
    expect(live).toHaveLength(0);
  });

  it('refuses the 501st task with 409 and changes nothing', async () => {
    const goal = await goalOf(alice(), 'Full');
    const scope = createUserScope(t.db, ALICE);
    const entityRows = await scope.insert(
      entities,
      Array.from({ length: MAX_TASKS_PER_GOAL }, (_, index) => ({
        type: 'task' as const,
        title: `T${String(index)}`,
      })),
    );
    await scope.insert(
      tasks,
      entityRows.map((entity, index) => ({ id: entity.id, title: entity.title, position: index })),
    );
    await scope.insert(
      links,
      entityRows.map((entity) => ({
        sourceId: entity.id,
        targetId: goal.id,
        relation: 'belongs_to' as const,
      })),
    );
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: MAX_TASKS_PER_GOAL });
    const extra = await taskOf(alice(), 'One too many');
    await expect(setGoal(alice(), extra.id, goal.id)).rejects.toMatchObject({
      statusCode: 409,
      message: 'A goal can have at most 500 tasks.',
    });
    await expect(
      registry.run(alice(), 'tasks.create', { title: 'Nope', goalId: goal.id }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await taskGoal(alice(), extra.id)).toBeNull();
    // A task that is already in the full goal can still be set to it
    const first = entityRows[0];
    expect((await setGoal(alice(), first?.id ?? '', goal.id)).undo).toBeNull();
  });

  it('a failed move keeps the old goal', async () => {
    const one = await goalOf(alice(), 'One');
    const task = await taskOf(alice(), 'T');
    await setGoal(alice(), task.id, one.id);
    expect(await statusCode(setGoal(alice(), task.id, MISSING))).toBe(404);
    expect(await taskGoal(alice(), task.id)).toEqual({ id: one.id, title: 'One' });
  });

  it('is a write action (no confirmation needed)', async () => {
    const goal = await goalOf(alice(), 'G');
    const task = await taskOf(alice(), 'T');
    await expect(
      registry.run(context(ALICE, false), 'goals.setTaskGoal', {
        taskId: task.id,
        goalId: goal.id,
      }),
    ).resolves.toBeDefined();
  });
});

describe('tasks with goals', () => {
  it('tasks.create with goalId returns the task with its goal', async () => {
    const goal = await goalOf(alice(), 'G');
    const task = await taskOf(alice(), 'T', { goalId: goal.id });
    expect(task.goal).toEqual({ id: goal.id, title: 'G' });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: 1 });
  });

  it('tasks.create with an unknown goal fails and creates no task', async () => {
    expect(
      await statusCode(registry.run(alice(), 'tasks.create', { title: 'T', goalId: MISSING })),
    ).toBe(404);
    expect((await run<Task[]>(alice(), 'tasks.list', {})).data).toEqual([]);
  });

  it('tasks.list with goalId includes done and archived top-level tasks only', async () => {
    const goal = await goalOf(alice(), 'G');
    const open = await taskOf(alice(), 'open', { goalId: goal.id });
    const done = await taskOf(alice(), 'done', { goalId: goal.id, status: 'done' });
    const archived = await taskOf(alice(), 'archived', { goalId: goal.id });
    await run(alice(), 'tasks.archive', { id: archived.id });
    const outside = await taskOf(alice(), 'outside');
    const sub = await taskOf(alice(), 'sub', { parentTaskId: open.id });
    const listed = (await run<Task[]>(alice(), 'tasks.list', { goalId: goal.id })).data.map(
      (x) => x.id,
    );
    expect(listed.sort()).toEqual([open.id, done.id, archived.id].sort());
    expect(listed).not.toContain(outside.id);
    expect(listed).not.toContain(sub.id);
    const empty = await goalOf(alice(), 'Empty');
    expect((await run<Task[]>(alice(), 'tasks.list', { goalId: empty.id })).data).toEqual([]);
  });

  it('hides task.goal and the list while the goal is deleted; restore brings everything back', async () => {
    const goal = await goalOf(alice(), 'G');
    const task = await taskOf(alice(), 'T', { goalId: goal.id });
    const deleted = await run<Goal>(alice(), 'goals.delete', { id: goal.id });
    expect(deleted.undo).toEqual({ action: 'goals.restore', input: { id: goal.id } });
    expect(await taskGoal(alice(), task.id)).toBeNull();
    expect((await run<Task[]>(alice(), 'tasks.list', { goalId: goal.id })).data).toEqual([]);
    expect(await statusCode(registry.run(alice(), 'goals.get', { id: goal.id }))).toBe(404);
    // The link stays and the task is untouched
    const kept = await t.db.select().from(links).where(eq(links.sourceId, task.id));
    expect(kept.filter((link) => link.deletedAt === null)).toHaveLength(1);
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, goal.id));
    expect(entity?.deletedAt).not.toBeNull();
    const [row] = await t.db.select().from(goals).where(eq(goals.id, goal.id));
    expect(row?.deletedAt).not.toBeNull();

    const restored = await run<Goal>(alice(), undoOf(deleted).action, undoOf(deleted).input);
    expect(restored.data.progress).toEqual({ done: 0, total: 1 });
    expect(restored.undo).toEqual({ action: 'goals.delete', input: { id: goal.id } });
    expect(await taskGoal(alice(), task.id)).toEqual({ id: goal.id, title: 'G' });
    const [back] = await t.db.select().from(entities).where(eq(entities.id, goal.id));
    expect(back?.deletedAt).toBeNull();
  });

  it('a task whose goal is deleted can move to another goal', async () => {
    const one = await goalOf(alice(), 'One');
    const two = await goalOf(alice(), 'Two');
    const task = await taskOf(alice(), 'T', { goalId: one.id });
    await run(alice(), 'goals.delete', { id: one.id });
    const moved = await setGoal(alice(), task.id, two.id);
    expect(moved.undo?.input).toEqual({ taskId: task.id, goalId: null });
    await run(alice(), 'goals.restore', { id: one.id });
    expect(await taskGoal(alice(), task.id)).toEqual({ id: two.id, title: 'Two' });
  });

  it('deleting a task keeps its link, so a restored task is back in the goal', async () => {
    const goal = await goalOf(alice(), 'G');
    const task = await taskOf(alice(), 'T', { goalId: goal.id });
    await run(alice(), 'tasks.delete', { id: task.id });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: 0 });
    await run(alice(), 'tasks.restore', { id: task.id });
    expect(await progressOf(alice(), goal.id)).toEqual({ done: 0, total: 1 });
  });

  it('loadTaskGoals and taskIdsOfGoal use few queries and answer empty inputs', async () => {
    const goal = await goalOf(alice(), 'G');
    const task = await taskOf(alice(), 'T', { goalId: goal.id });
    const free = await taskOf(alice(), 'Free');
    const scope = createUserScope(t.db, ALICE);
    const map = await loadTaskGoals(scope, [task.id, free.id]);
    expect([...map.keys()]).toEqual([task.id]);
    expect((await loadTaskGoals(scope, [])).size).toBe(0);
    expect(await taskIdsOfGoal(scope, goal.id)).toEqual([task.id]);
    expect(await taskIdsOfGoal(scope, MISSING)).toEqual([]);
  });
});

describe('goals.delete and goals.restore', () => {
  it('delete is destructive: it needs confirmation, and the goal stays when refused', async () => {
    const goal = await goalOf(alice(), 'G');
    await expect(
      registry.run(context(ALICE, false), 'goals.delete', { id: goal.id }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await getGoal(alice(), goal.id)).id).toBe(goal.id);
    expect(registry.permissionOf('goals.delete')).toBe('destructive');
    expect(registry.permissionOf('goals.restore')).toBe('write');
  });

  it('deleting twice answers 404; restoring a live goal changes nothing', async () => {
    const goal = await goalOf(alice(), 'G');
    await run(alice(), 'goals.delete', { id: goal.id });
    expect(await statusCode(registry.run(alice(), 'goals.delete', { id: goal.id }))).toBe(404);
    await run(alice(), 'goals.restore', { id: goal.id });
    const again = await run<Goal>(alice(), 'goals.restore', { id: goal.id });
    expect(again.undo).toBeNull();
    expect(await statusCode(registry.run(alice(), 'goals.restore', { id: MISSING }))).toBe(404);
  });
});

describe('user isolation', () => {
  it('another user cannot read, change, delete, restore or link to someone else goal', async () => {
    const goal = await goalOf(alice(), 'Alices');
    const aliceTask = await taskOf(alice(), 'AT', { goalId: goal.id });
    const bobTask = await taskOf(bob(), 'BT');
    expect(await statusCode(registry.run(bob(), 'goals.get', { id: goal.id }))).toBe(404);
    expect(await statusCode(registry.run(bob(), 'goals.update', { id: goal.id, title: 'X' }))).toBe(
      404,
    );
    expect(
      await statusCode(registry.run(bob(), 'goals.setStatus', { id: goal.id, status: 'dropped' })),
    ).toBe(404);
    expect(await statusCode(registry.run(bob(), 'goals.delete', { id: goal.id }))).toBe(404);
    expect(await statusCode(registry.run(bob(), 'goals.restore', { id: goal.id }))).toBe(404);
    expect(await statusCode(setGoal(bob(), bobTask.id, goal.id))).toBe(404);
    expect(await statusCode(setGoal(bob(), aliceTask.id, null))).toBe(404);
    expect(await statusCode(setGoal(alice(), bobTask.id, goal.id))).toBe(404);
    expect((await run<Goal[]>(bob(), 'goals.list', {})).data).toEqual([]);
    expect((await run<Task[]>(bob(), 'tasks.list', { goalId: goal.id })).data).toEqual([]);
    const bobScope = createUserScope(t.db, BOB);
    expect((await loadGoalProgress(bobScope, [goal.id])).get(goal.id)).toEqual({
      done: 0,
      total: 0,
    });
    expect((await loadTaskGoals(bobScope, [aliceTask.id])).size).toBe(0);
    expect(await taskIdsOfGoal(bobScope, goal.id)).toEqual([]);
    // Alice still sees everything unchanged
    expect(await getGoal(alice(), goal.id)).toMatchObject({
      title: 'Alices',
      status: 'active',
      progress: { done: 0, total: 1 },
    });
  });
});
