import { habitLogs } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { Habit, HabitStats } from '@personal-os/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

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
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterAll(async () => {
  vi.useRealTimers();
  await t.close();
});
beforeEach(async () => {
  // Wednesday 14 Oct 2026, 10:00 India time
  vi.setSystemTime(new Date('2026-10-14T04:30:00Z'));
  await t.db.execute(sql`truncate table habit_logs, habits, auth.users cascade`);
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});
afterEach(() => {
  vi.setSystemTime(new Date('2026-10-14T04:30:00Z'));
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
const create = async (ctx: ActionContext, input: Record<string, unknown> = {}) =>
  (await run<Habit>(ctx, 'habits.create', { name: 'Read', ...input })).data;
const get = async (ctx: ActionContext, id: string) =>
  (await run<Habit>(ctx, 'habits.get', { id })).data;

describe('habits.create and get', () => {
  it('creates a daily habit starting today with defaults', async () => {
    const habit = await create(alice());
    expect(habit).toMatchObject({
      name: 'Read',
      schedule: { type: 'daily' },
      target: 1,
      startDate: '2026-10-14',
      archivedAt: null,
      currentStreak: 0,
      bestStreak: 0,
      today: { date: '2026-10-14', scheduled: true, count: 0, done: false },
    });
  });

  it('stores weekly days, category, reminder, color and notes', async () => {
    const habit = await create(alice(), {
      name: 'Gym',
      category: 'Health',
      schedule: { type: 'weekly', days: [3, 1] },
      target: 2,
      reminderTime: '07:30',
      color: '#C6E46E',
      notes: 'Legs on Wednesday',
    });
    expect(habit).toMatchObject({
      category: 'Health',
      schedule: { type: 'weekly', days: [1, 3] },
      target: 2,
      reminderTime: '07:30',
      color: '#C6E46E',
      notes: 'Legs on Wednesday',
    });
  });

  it('rejects bad input', async () => {
    await expect(run(alice(), 'habits.create', { name: ' ' })).rejects.toBeInstanceOf(ZodError);
  });

  it('undo of create archives the habit', async () => {
    const result = await run<Habit>(alice(), 'habits.create', { name: 'Read' });
    const undo = undoOf(result);
    expect(undo.action).toBe('habits.archive');
    await run(alice(), undo.action, undo.input);
    expect((await get(alice(), result.data.id)).archivedAt).not.toBeNull();
  });

  it('get gives 404 for a missing habit and for another user', async () => {
    const habit = await create(alice());
    await expect(run(alice(), 'habits.get', { id: MISSING })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(run(bob(), 'habits.get', { id: habit.id })).rejects.toBeInstanceOf(HttpError);
  });
});

describe('habits.list', () => {
  it('lists active habits oldest first and archived ones separately, only the own', async () => {
    const one = await create(alice(), { name: 'One' });
    const two = await create(alice(), { name: 'Two' });
    await create(bob(), { name: 'Bob habit' });
    await run(alice(), 'habits.archive', { id: two.id });
    const active = (await run<Habit[]>(alice(), 'habits.list', {})).data;
    expect(active.map((habit) => habit.id)).toEqual([one.id]);
    const archived = (await run<Habit[]>(alice(), 'habits.list', { archived: true })).data;
    expect(archived.map((habit) => habit.id)).toEqual([two.id]);
    const bobs = (await run<Habit[]>(bob(), 'habits.list', {})).data;
    expect(bobs.map((habit) => habit.name)).toEqual(['Bob habit']);
  });
});

describe('habits.update', () => {
  it('changes fields and undo puts them back', async () => {
    const habit = await create(alice());
    const result = await run<Habit>(alice(), 'habits.update', {
      id: habit.id,
      name: 'Read more',
      category: 'Mind',
      schedule: { type: 'custom', everyDays: 2 },
    });
    expect(result.data).toMatchObject({
      name: 'Read more',
      category: 'Mind',
      schedule: { type: 'custom', everyDays: 2 },
    });
    const undo = undoOf(result);
    await run(alice(), undo.action, undo.input);
    expect(await get(alice(), habit.id)).toMatchObject({
      name: 'Read',
      category: null,
      schedule: { type: 'daily' },
    });
  });

  it('a change that changes nothing gives no undo', async () => {
    const habit = await create(alice());
    const result = await run(alice(), 'habits.update', { id: habit.id, name: 'Read' });
    expect(result.undo ?? null).toBeNull();
  });

  it("cannot change another user's habit", async () => {
    const habit = await create(alice());
    await expect(
      run(bob(), 'habits.update', { id: habit.id, name: 'Stolen' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect((await get(alice(), habit.id)).name).toBe('Read');
  });
});

describe('habits.archive and restore', () => {
  it('archive and restore undo each other', async () => {
    const habit = await create(alice());
    const archived = await run<Habit>(alice(), 'habits.archive', { id: habit.id });
    expect(archived.data.archivedAt).not.toBeNull();
    const undo = undoOf(archived);
    expect(undo.action).toBe('habits.restore');
    const restored = await run<Habit>(alice(), undo.action, undo.input);
    expect(restored.data.archivedAt).toBeNull();
    expect(undoOf(restored).action).toBe('habits.archive');
  });

  it('archiving twice is a no-op', async () => {
    const habit = await create(alice());
    await run(alice(), 'habits.archive', { id: habit.id });
    const again = await run(alice(), 'habits.archive', { id: habit.id });
    expect(again.undo ?? null).toBeNull();
  });
});

describe('habits.log and unlog', () => {
  it('one click marks today done with the target and starts a streak', async () => {
    const habit = await create(alice(), { target: 3 });
    const result = await run<Habit>(alice(), 'habits.log', { id: habit.id });
    expect(result.data.today).toMatchObject({ count: 3, done: true });
    expect(result.data.currentStreak).toBe(1);
    expect(undoOf(result)).toEqual({
      action: 'habits.unlog',
      input: { id: habit.id, date: '2026-10-14' },
    });
  });

  it('a counter can be set step by step, and undo restores the previous count', async () => {
    const habit = await create(alice(), { target: 3 });
    await run(alice(), 'habits.log', { id: habit.id, count: 1 });
    const second = await run<Habit>(alice(), 'habits.log', { id: habit.id, count: 2 });
    expect(second.data.today).toMatchObject({ count: 2, done: false });
    expect(second.data.atRisk).toBe(false);
    const undo = undoOf(second);
    expect(undo).toEqual({
      action: 'habits.log',
      input: { id: habit.id, date: '2026-10-14', count: 1 },
    });
    const back = await run<Habit>(alice(), undo.action, undo.input);
    expect(back.data.today.count).toBe(1);
  });

  it('keeps one row per habit per day', async () => {
    const habit = await create(alice());
    await run(alice(), 'habits.log', { id: habit.id });
    const again = await run(alice(), 'habits.log', { id: habit.id });
    expect(again.undo ?? null).toBeNull();
    const rows = await t.db.select().from(habitLogs).where(eq(habitLogs.habitId, habit.id));
    expect(rows).toHaveLength(1);
  });

  it('two clicks at the same moment still make one row', async () => {
    const habit = await create(alice());
    await Promise.all([
      run(alice(), 'habits.log', { id: habit.id }),
      run(alice(), 'habits.log', { id: habit.id }),
    ]);
    const rows = await t.db.select().from(habitLogs).where(eq(habitLogs.habitId, habit.id));
    expect(rows).toHaveLength(1);
  });

  it('unlog removes the day and its undo puts it back', async () => {
    const habit = await create(alice(), { target: 2 });
    await run(alice(), 'habits.log', { id: habit.id });
    const removed = await run<Habit>(alice(), 'habits.unlog', { id: habit.id });
    expect(removed.data.today).toMatchObject({ count: 0, done: false });
    const undo = undoOf(removed);
    const back = await run<Habit>(alice(), undo.action, undo.input);
    expect(back.data.today).toMatchObject({ count: 2, done: true });
  });

  it('unlog of a day without a log changes nothing', async () => {
    const habit = await create(alice());
    const result = await run(alice(), 'habits.unlog', { id: habit.id });
    expect(result.undo ?? null).toBeNull();
  });

  it('logs a past day from the start date and counts the streak', async () => {
    const habit = await create(alice(), { startDate: '2026-10-10' });
    for (const date of ['2026-10-12', '2026-10-13']) {
      await run(alice(), 'habits.log', { id: habit.id, date });
    }
    const view = await get(alice(), habit.id);
    expect(view.currentStreak).toBe(2);
    expect(view.atRisk).toBe(true);
    expect(view.bestStreak).toBe(2);
  });

  it('uses the India day: 00:10 India time on the 15th is already the 15th', async () => {
    vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
    const habit = await create(alice());
    expect(habit.today.date).toBe('2026-10-15');
    expect(habit.startDate).toBe('2026-10-15');
  });

  it('rejects the future, days before the start, and archived habits', async () => {
    const habit = await create(alice());
    await expect(
      run(alice(), 'habits.log', { id: habit.id, date: '2026-10-15' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      run(alice(), 'habits.log', { id: habit.id, date: '2026-10-13' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await run(alice(), 'habits.archive', { id: habit.id });
    await expect(run(alice(), 'habits.log', { id: habit.id })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(run(alice(), 'habits.unlog', { id: habit.id })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("cannot log or unlog another user's habit", async () => {
    const habit = await create(alice());
    await expect(run(bob(), 'habits.log', { id: habit.id })).rejects.toMatchObject({
      statusCode: 404,
    });
    await run(alice(), 'habits.log', { id: habit.id });
    await expect(run(bob(), 'habits.unlog', { id: habit.id })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await get(alice(), habit.id)).today.done).toBe(true);
  });

  it('keeps the logs when a habit is archived and restored', async () => {
    const habit = await create(alice());
    await run(alice(), 'habits.log', { id: habit.id });
    await run(alice(), 'habits.archive', { id: habit.id });
    await run(alice(), 'habits.restore', { id: habit.id });
    expect((await get(alice(), habit.id)).today.done).toBe(true);
  });
});

describe('habits.stats', () => {
  it('gives the month with days, rate and streaks', async () => {
    const habit = await create(alice(), { startDate: '2026-10-01' });
    for (const date of ['2026-10-12', '2026-10-13', '2026-10-14']) {
      await run(alice(), 'habits.log', { id: habit.id, date });
    }
    const { data } = await run<HabitStats>(alice(), 'habits.stats', {
      id: habit.id,
      range: 'month',
    });
    expect(data).toMatchObject({
      id: habit.id,
      from: '2026-10-01',
      to: '2026-10-31',
      scheduledCount: 14,
      doneCount: 3,
      currentStreak: 3,
      bestStreak: 3,
      totalDone: 3,
    });
    expect(data.days).toHaveLength(31);
    expect(data.days[13]).toMatchObject({ date: '2026-10-14', done: true, future: false });
    expect(data.days[14]?.future).toBe(true);
  });

  it('takes an anchor and a week range; 404 for another user', async () => {
    const habit = await create(alice());
    const { data } = await run<HabitStats>(alice(), 'habits.stats', {
      id: habit.id,
      range: 'week',
      anchor: '2026-10-05',
    });
    expect(data.from).toBe('2026-10-05');
    expect(data.to).toBe('2026-10-11');
    await expect(run(bob(), 'habits.stats', { id: habit.id })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
