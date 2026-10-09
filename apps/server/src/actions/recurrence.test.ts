import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';
import { nextDueDate } from './recurrence';

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
afterEach(() => {
  vi.useRealTimers();
});

/** An India wall-clock time such as '2026-10-09 09:00' as an ISO string in UTC. */
const ist = (wallClock: string) =>
  new Date(`${wallClock.replace(' ', 'T')}:00+05:30`).toISOString();

/** Only the clock is faked, so PGlite keeps working. */
const setNow = (wallClock: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(ist(wallClock)));
};

interface Item {
  id: string;
  title: string;
  status: string;
  priority: number;
  position: number;
  description: string | null;
  dueAt: string | null;
  dueAllDay: boolean;
  reminderAt: string | null;
  recurrenceRule: string | null;
  completedAt: string | null;
  parentTaskId: string | null;
  tags: { id: string }[];
}

async function create(ctx: ActionContext, input: Record<string, unknown>) {
  return (await registry.run(ctx, 'tasks.create', input)).data as Item;
}
async function list(ctx: ActionContext, input: Record<string, unknown> = {}) {
  return (await registry.run(ctx, 'tasks.list', { limit: 1000, ...input })).data as Item[];
}
/** The live, not done tasks other than `except`: the copies. */
async function openTasks(ctx: ActionContext) {
  return list(ctx, { status: ['todo', 'doing'] });
}
async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

const DAILY = 'FREQ=DAILY';
const WEEKLY_MO_WE = 'FREQ=WEEKLY;BYDAY=MO,WE';
const YEARLY = 'FREQ=YEARLY';
const monthly = (day: number) => `FREQ=MONTHLY;BYMONTHDAY=${String(day)}`;

describe('nextDueDate (India time)', () => {
  // [name, rule, old due (India), now (India), expected (India)]. 9 October 2026 is a Friday.
  const cases: [string, string, string, string, string][] = [
    ['daily, completed on time', DAILY, '2026-10-09 09:00', '2026-10-09 10:00', '2026-10-10 09:00'],
    ['daily, completed early', DAILY, '2026-10-20 09:00', '2026-10-09 10:00', '2026-10-21 09:00'],
    [
      'daily, 5 days late: not overdue',
      DAILY,
      '2026-10-01 09:00',
      '2026-10-06 12:00',
      '2026-10-07 09:00',
    ],
    ['daily, late the same day', DAILY, '2026-10-09 09:00', '2026-10-09 23:00', '2026-10-10 09:00'],
    [
      'weekly Mon+Wed, after Wednesday',
      WEEKLY_MO_WE,
      '2026-10-07 09:00',
      '2026-10-07 10:00',
      '2026-10-12 09:00',
    ],
    [
      'weekly Mon+Wed, after Monday',
      WEEKLY_MO_WE,
      '2026-10-12 09:00',
      '2026-10-12 10:00',
      '2026-10-14 09:00',
    ],
    [
      'weekly Mon+Wed, 3 weeks late',
      WEEKLY_MO_WE,
      '2026-10-07 09:00',
      '2026-10-29 10:00',
      '2026-11-02 09:00',
    ],
    [
      'weekly Mon+Sun, after Sunday wraps to Monday',
      'FREQ=WEEKLY;BYDAY=MO,SU',
      '2026-10-11 09:00',
      '2026-10-11 10:00',
      '2026-10-12 09:00',
    ],
    [
      'weekly Friday, 00:10 India time',
      'FREQ=WEEKLY;BYDAY=FR',
      '2026-10-09 00:10',
      '2026-10-09 00:20',
      '2026-10-16 00:10',
    ],
    ['daily, 00:10 India time', DAILY, '2026-10-09 00:10', '2026-10-09 00:20', '2026-10-10 00:10'],
    [
      'monthly on the 15th',
      monthly(15),
      '2026-10-15 09:00',
      '2026-10-15 10:00',
      '2026-11-15 09:00',
    ],
    [
      'monthly on the 15th, across the year end',
      monthly(15),
      '2026-12-15 09:00',
      '2026-12-15 10:00',
      '2027-01-15 09:00',
    ],
    [
      'monthly on the 31st, 31 Jan to 28 Feb',
      monthly(31),
      '2026-01-31 09:00',
      '2026-01-31 10:00',
      '2026-02-28 09:00',
    ],
    [
      'monthly on the 31st, 28 Feb to 31 Mar',
      monthly(31),
      '2026-02-28 09:00',
      '2026-02-28 10:00',
      '2026-03-31 09:00',
    ],
    [
      'monthly on the 31st, 31 Mar to 30 Apr',
      monthly(31),
      '2026-03-31 09:00',
      '2026-03-31 10:00',
      '2026-04-30 09:00',
    ],
    [
      'monthly on the 31st, 30 Apr to 31 May',
      monthly(31),
      '2026-04-30 09:00',
      '2026-04-30 10:00',
      '2026-05-31 09:00',
    ],
    [
      'monthly on the 31st, leap year February',
      monthly(31),
      '2028-01-31 09:00',
      '2028-01-31 10:00',
      '2028-02-29 09:00',
    ],
    [
      'monthly on the 30th, February',
      monthly(30),
      '2026-01-30 09:00',
      '2026-01-30 10:00',
      '2026-02-28 09:00',
    ],
    [
      'monthly on the 30th, 31-day month',
      monthly(30),
      '2026-03-30 09:00',
      '2026-03-30 10:00',
      '2026-04-30 09:00',
    ],
    [
      'monthly on the 29th, non-leap February',
      monthly(29),
      '2027-01-29 09:00',
      '2027-01-29 10:00',
      '2027-02-28 09:00',
    ],
    [
      'monthly on the 29th, leap February',
      monthly(29),
      '2028-01-29 09:00',
      '2028-01-29 10:00',
      '2028-02-29 09:00',
    ],
    [
      'monthly on the 31st, late by two months',
      monthly(31),
      '2026-01-31 09:00',
      '2026-04-10 10:00',
      '2026-04-30 09:00',
    ],
    ['yearly', YEARLY, '2026-10-09 09:00', '2026-10-09 10:00', '2027-10-09 09:00'],
    [
      'yearly on 29 February goes to 28 February',
      YEARLY,
      '2028-02-29 09:00',
      '2028-02-29 10:00',
      '2029-02-28 09:00',
    ],
    [
      'all-day daily stays at the start of the India day',
      DAILY,
      '2026-10-09 00:00',
      '2026-10-09 15:00',
      '2026-10-10 00:00',
    ],
  ];

  it.each(cases)('%s', (_name, rule, due, now, expected) => {
    const next = nextDueDate(rule, new Date(ist(due)), new Date(ist(now)));
    expect(next?.toISOString()).toBe(ist(expected));
  });

  it('is null for a rule that is not a preset', () => {
    expect(nextDueDate('FREQ=HOURLY', new Date(ist('2026-10-09 09:00')), new Date())).toBeNull();
  });
});

describe('completing a repeating task', () => {
  it('creates the next copy with the same fields, tags and a shifted reminder', async () => {
    setNow('2026-10-09 10:00');
    const tag = (await registry.run(alice(), 'tags.create', { name: 'home' })).data as {
      id: string;
    };
    const task = await create(alice(), {
      title: 'Water plants',
      description: 'Balcony too',
      priority: 2,
      dueAt: ist('2026-10-09 09:00'),
      reminderAt: ist('2026-10-09 08:00'),
      recurrenceRule: DAILY,
      tagIds: [tag.id],
    });
    const done = await registry.run(alice(), 'tasks.complete', { id: task.id });
    expect(done.data).toMatchObject({ status: 'done' });

    const [copy] = await openTasks(alice());
    expect(copy).toMatchObject({
      title: 'Water plants',
      description: 'Balcony too',
      priority: 2,
      status: 'todo',
      completedAt: null,
      dueAt: ist('2026-10-10 09:00'),
      reminderAt: ist('2026-10-10 08:00'),
      dueAllDay: false,
      recurrenceRule: DAILY,
    });
    expect(copy?.id).not.toBe(task.id);
    expect(copy?.tags.map((entry) => entry.id)).toEqual([tag.id]);
  });

  it('keeps an all-day task all-day at the start of the India day', async () => {
    setNow('2026-10-09 10:00');
    const task = await create(alice(), {
      title: 'All day',
      dueAt: ist('2026-10-09 00:00'),
      dueAllDay: true,
      recurrenceRule: DAILY,
    });
    await registry.run(alice(), 'tasks.complete', { id: task.id });
    const [copy] = await openTasks(alice());
    expect(copy).toMatchObject({ dueAllDay: true, dueAt: ist('2026-10-10 00:00') });
  });

  it('puts a copy of a task that is days late after now, not in the past', async () => {
    setNow('2026-10-06 12:00');
    const task = await create(alice(), {
      title: 'Late',
      dueAt: ist('2026-10-01 09:00'),
      recurrenceRule: DAILY,
    });
    await registry.run(alice(), 'tasks.complete', { id: task.id });
    const [copy] = await openTasks(alice());
    expect(copy?.dueAt).toBe(ist('2026-10-07 09:00'));
  });

  it('does not copy subtasks, and puts the copy after the last sibling', async () => {
    setNow('2026-10-09 10:00');
    const first = await create(alice(), {
      title: 'Repeats',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    const last = await create(alice(), { title: 'Last one' });
    await create(alice(), { title: 'Step', parentTaskId: first.id });
    await registry.run(alice(), 'tasks.complete', { id: first.id });

    const all = await list(alice());
    const copy = all.find((task) => task.title === 'Repeats' && task.status === 'todo');
    expect(copy?.position).toBe(last.position + 1024);
    // The only subtask is still the original one
    const subs = await list(alice(), { parent: first.id });
    expect(subs.map((task) => task.title)).toEqual(['Step']);
    expect(await list(alice(), { parent: copy?.id })).toHaveLength(0);
  });

  it('copies a subtask under the same parent', async () => {
    setNow('2026-10-09 10:00');
    const parent = await create(alice(), { title: 'Parent' });
    const sub = await create(alice(), {
      title: 'Sub',
      parentTaskId: parent.id,
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    await registry.run(alice(), 'tasks.complete', { id: sub.id });
    const subs = await list(alice(), { parent: parent.id });
    expect(subs).toHaveLength(2);
  });

  it('makes no copy without a rule, without a due date, or with a rule that is not a preset', async () => {
    setNow('2026-10-09 10:00');
    const noRule = await create(alice(), { title: 'a', dueAt: ist('2026-10-09 09:00') });
    const noDate = await create(alice(), { title: 'b' });
    const odd = await create(alice(), { title: 'c', dueAt: ist('2026-10-09 09:00') });
    await t.db.execute(sql`update tasks set recurrence_rule = 'FREQ=HOURLY' where id = ${odd.id}`);
    // A rule without a due date cannot be set through the API, so write it directly
    await t.db.execute(
      sql`update tasks set recurrence_rule = 'FREQ=DAILY' where id = ${noDate.id}`,
    );
    for (const task of [noRule, noDate, odd]) {
      await registry.run(alice(), 'tasks.complete', { id: task.id });
    }
    expect(await openTasks(alice())).toHaveLength(0);
    expect(await list(alice())).toHaveLength(3);
  });

  it('creates the copy for tasks.update to done and for tasks.move into done', async () => {
    setNow('2026-10-09 10:00');
    const one = await create(alice(), {
      title: 'one',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    const two = await create(alice(), {
      title: 'two',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    await registry.run(alice(), 'tasks.update', { id: one.id, status: 'done' });
    await registry.run(alice(), 'tasks.move', { id: two.id, status: 'done' });
    const open = await openTasks(alice());
    expect(open.map((task) => task.title).sort()).toEqual(['one', 'two']);
    expect(open.every((task) => task.dueAt === ist('2026-10-10 09:00'))).toBe(true);
  });

  it('makes one copy when the same task is completed twice at once', async () => {
    setNow('2026-10-09 10:00');
    const task = await create(alice(), {
      title: 'Twice',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    await Promise.all([
      registry.run(alice(), 'tasks.complete', { id: task.id }),
      registry.run(alice(), 'tasks.complete', { id: task.id }),
    ]);
    const copies = (await openTasks(alice())).filter((row) => row.title === 'Twice');
    expect(copies).toHaveLength(1);
  });

  it('does not make a second copy when the task is done, reopened, and done again', async () => {
    setNow('2026-10-09 10:00');
    const task = await create(alice(), {
      title: 'Round trip',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    await registry.run(alice(), 'tasks.complete', { id: task.id });
    await registry.run(alice(), 'tasks.update', { id: task.id, status: 'todo' });
    await registry.run(alice(), 'tasks.update', { id: task.id, status: 'done' });
    const open = (await openTasks(alice())).filter((row) => row.title === 'Round trip');
    // The reopened original is open again? No: it is done again, so only the one copy is open
    expect(open).toHaveLength(1);
  });

  it('does not copy again when the task is already done', async () => {
    setNow('2026-10-09 10:00');
    const task = await create(alice(), {
      title: 'Once',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    await registry.run(alice(), 'tasks.complete', { id: task.id });
    const again = await registry.run(alice(), 'tasks.complete', { id: task.id });
    expect(again.undo).toBeNull();
    expect(await openTasks(alice())).toHaveLength(1);
  });
});

describe('tasks.reopen (the undo of completing)', () => {
  async function completeRepeating() {
    setNow('2026-10-09 10:00');
    const task = await create(alice(), {
      title: 'Repeats',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: DAILY,
    });
    const done = await registry.run(alice(), 'tasks.complete', { id: task.id });
    return { task, done };
  }

  it('has the write permission level', () => {
    expect(registry.permissionOf('tasks.reopen')).toBe('write');
  });

  it('is what tasks.complete returns for a repeating task', async () => {
    const { task, done } = await completeRepeating();
    const [copy] = await openTasks(alice());
    expect(done.undo).toEqual({
      action: 'tasks.reopen',
      input: { id: task.id, status: 'todo', removeIds: [copy?.id] },
    });
  });

  it('restores the task and removes the copy, with no undo of its own', async () => {
    const { task, done } = await completeRepeating();
    if (!done.undo) throw new Error('expected an undo');
    const undone = await registry.run(alice(), done.undo.action, done.undo.input);
    expect(undone.data).toMatchObject({ id: task.id, status: 'todo', completedAt: null });
    expect(undone.undo).toBeNull();
    const open = await openTasks(alice());
    expect(open.map((entry) => entry.id)).toEqual([task.id]);
    const entityRows = await t.db.execute(
      sql`select count(*)::int as n from entities where deleted_at is null`,
    );
    expect((entityRows.rows[0] as { n: number }).n).toBe(1);
  });

  it('leaves a copy that was completed in the meantime alone', async () => {
    const { task, done } = await completeRepeating();
    const [copy] = await openTasks(alice());
    if (!copy || !done.undo) throw new Error('expected a copy and an undo');
    await registry.run(alice(), 'tasks.complete', { id: copy.id });
    await registry.run(alice(), done.undo.action, done.undo.input);
    const all = await list(alice());
    expect(all.find((entry) => entry.id === copy.id)).toMatchObject({ status: 'done' });
    expect(all.find((entry) => entry.id === task.id)).toMatchObject({ status: 'todo' });
  });

  it('never touches the tasks of another user', async () => {
    const { task } = await completeRepeating();
    const theirs = await create(bob(), { title: 'Not yours' });
    await registry.run(alice(), 'tasks.reopen', {
      id: task.id,
      status: 'todo',
      removeIds: [theirs.id],
    });
    expect((await list(bob())).map((entry) => entry.id)).toEqual([theirs.id]);
    // And Bob cannot reopen Alice's task
    const error = await failure(
      registry.run(bob(), 'tasks.reopen', { id: task.id, status: 'todo', removeIds: [] }),
    );
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(404);
  });

  it('does not delete the reopened task itself', async () => {
    const { task } = await completeRepeating();
    await registry.run(alice(), 'tasks.reopen', {
      id: task.id,
      status: 'todo',
      removeIds: [task.id],
    });
    expect((await openTasks(alice())).map((entry) => entry.id)).toContain(task.id);
  });

  it('removes only real copies: an unrelated task in removeIds stays', async () => {
    const { task } = await completeRepeating();
    const unrelated = await create(alice(), { title: 'Unrelated' });
    const otherRule = await create(alice(), {
      title: 'Other rule',
      dueAt: ist('2026-10-12 09:00'),
      recurrenceRule: 'FREQ=YEARLY',
    });
    const [copy] = await openTasks(alice()).then((rows) =>
      rows.filter((row) => row.title === 'Repeats' && row.id !== task.id),
    );
    await registry.run(alice(), 'tasks.reopen', {
      id: task.id,
      status: 'todo',
      removeIds: [unrelated.id, otherRule.id, copy?.id],
    });
    const ids = (await openTasks(alice())).map((row) => row.id);
    expect(ids).toContain(unrelated.id);
    expect(ids).toContain(otherRule.id);
    expect(ids).not.toContain(copy?.id);
  });

  it('removes the subtasks of a removed copy too', async () => {
    const { task } = await completeRepeating();
    const [copy] = (await openTasks(alice())).filter((row) => row.id !== task.id);
    if (!copy) throw new Error('expected a copy');
    const child = await create(alice(), { title: 'Child', parentTaskId: copy.id });
    await registry.run(alice(), 'tasks.reopen', {
      id: task.id,
      status: 'todo',
      removeIds: [copy.id],
    });
    const children = await list(alice(), { parent: copy.id });
    expect(children.map((row) => row.id)).not.toContain(child.id);
  });

  it('cannot be used to complete a task', async () => {
    const { task } = await completeRepeating();
    const error = await failure(
      registry.run(alice(), 'tasks.reopen', { id: task.id, status: 'done', removeIds: [] }),
    );
    expect(error).toBeInstanceOf(ZodError);
  });

  it('rejects bad input', async () => {
    const error = await failure(
      registry.run(alice(), 'tasks.reopen', { id: 'nope', removeIds: [] }),
    );
    expect(error).toBeInstanceOf(ZodError);
  });
});

describe('setting a recurrence rule', () => {
  it('accepts a preset on create and on update, and clears it with null', async () => {
    const task = await create(alice(), {
      title: 'a',
      dueAt: ist('2026-10-09 09:00'),
      recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=15',
    });
    expect(task.recurrenceRule).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
    const updated = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      recurrenceRule: WEEKLY_MO_WE,
    });
    expect(updated.data).toMatchObject({ recurrenceRule: WEEKLY_MO_WE });
    const cleared = await registry.run(alice(), 'tasks.update', {
      id: task.id,
      recurrenceRule: null,
    });
    expect(cleared.data).toMatchObject({ recurrenceRule: null });
  });

  it('rejects a rule that is not a preset', async () => {
    const task = await create(alice(), { title: 'a', dueAt: ist('2026-10-09 09:00') });
    const onCreate = await failure(
      registry.run(alice(), 'tasks.create', {
        title: 'b',
        dueAt: ist('2026-10-09 09:00'),
        recurrenceRule: 'FREQ=HOURLY',
      }),
    );
    const onUpdate = await failure(
      registry.run(alice(), 'tasks.update', { id: task.id, recurrenceRule: 'FREQ=WEEKLY' }),
    );
    expect(onCreate).toBeInstanceOf(ZodError);
    expect(onUpdate).toBeInstanceOf(ZodError);
  });

  it('rejects a rule without a due date with a 400 on update', async () => {
    const task = await create(alice(), { title: 'a' });
    const error = await failure(
      registry.run(alice(), 'tasks.update', { id: task.id, recurrenceRule: DAILY }),
    );
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(400);
  });

  it('rejects a rule without a due date with a 400 on create', async () => {
    const error = await failure(
      registry.run(alice(), 'tasks.create', { title: 'a', recurrenceRule: DAILY }),
    );
    // The shared schema refuses it (a ZodError becomes a 400 validation_error)
    expect(error).toBeInstanceOf(ZodError);
  });
});
