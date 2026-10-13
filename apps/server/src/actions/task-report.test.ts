import { entities, entityTags, tags, tasks } from '@personal-os/db';
import { taskReportSchema, type TaskReport } from '@personal-os/shared';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
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

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 15 Oct 2026, 12:00 in India
  setNow('2026-10-15T06:30:00.000Z');
  await t.db.execute(
    sql`truncate table entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

afterEach(() => {
  vi.useRealTimers();
});

function setNow(isoTime: string) {
  vi.setSystemTime(new Date(isoTime));
}

async function report(period: 'week' | 'month', userId = ALICE): Promise<TaskReport> {
  const { data } = await registry.run(context(userId), 'tasks.report', { period });
  return taskReportSchema.parse(data);
}

interface Seed {
  userId?: string;
  status?: 'todo' | 'doing' | 'done';
  createdAt?: string;
  completedAt?: string | null;
  dueAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  parentTaskId?: string | null;
}

const at = (value: string | null | undefined) => (value ? new Date(value) : null);

/** Inserts a task straight into the database so every date can be chosen. */
async function seed(options: Seed = {}): Promise<string> {
  const userId = options.userId ?? ALICE;
  const [entity] = await t.db
    .insert(entities)
    .values({ userId, type: 'task', title: 't' })
    .returning();
  if (!entity) throw new Error('no entity');
  await t.db.insert(tasks).values({
    id: entity.id,
    userId,
    title: 't',
    status: options.status ?? 'todo',
    createdAt: new Date(options.createdAt ?? '2026-01-01T00:00:00.000Z'),
    completedAt: at(options.completedAt),
    dueAt: at(options.dueAt),
    archivedAt: at(options.archivedAt),
    deletedAt: at(options.deletedAt),
    parentTaskId: options.parentTaskId ?? null,
  });
  return entity.id;
}

const done = (completedAt: string, options: Seed = {}) =>
  seed({ status: 'done', completedAt, ...options });

async function tag(name: string, userId = ALICE, deletedAt: string | null = null): Promise<string> {
  const [row] = await t.db
    .insert(tags)
    .values({ userId, name, color: '#F7D96B', deletedAt: at(deletedAt) })
    .returning();
  if (!row) throw new Error('no tag');
  return row.id;
}

async function tagTask(taskId: string, ...tagIds: string[]) {
  await t.db
    .insert(entityTags)
    .values(tagIds.map((tagId) => ({ userId: ALICE, entityId: taskId, tagId })));
}

describe('tasks.report periods', () => {
  it('week runs Monday to Sunday of the India week, with a day for each', async () => {
    const result = await report('week');
    expect(result).toMatchObject({
      period: 'week',
      timeZone: 'Asia/Kolkata',
      today: '2026-10-15',
      start: '2026-10-12',
      end: '2026-10-18',
    });
    expect(result.days.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(result.previous).toMatchObject({ start: '2026-10-05', end: '2026-10-08' });
  });

  it('on a Monday the week has one day passed and the previous week one day', async () => {
    setNow('2026-10-12T00:10:00+05:30');
    const result = await report('week');
    expect(result).toMatchObject({ today: '2026-10-12', start: '2026-10-12', end: '2026-10-18' });
    expect(result.previous).toMatchObject({ start: '2026-10-05', end: '2026-10-05' });
  });

  it('on a Sunday the week still starts on the Monday before', async () => {
    setNow('2026-10-18T23:50:00+05:30');
    const result = await report('week');
    expect(result).toMatchObject({ today: '2026-10-18', start: '2026-10-12', end: '2026-10-18' });
    expect(result.previous).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('uses the India day, not the UTC day, for today', async () => {
    // 18:40 UTC on Sunday 11 Oct is 00:10 IST on Monday 12 Oct
    setNow('2026-10-11T18:40:00.000Z');
    expect((await report('week')).today).toBe('2026-10-12');
    // 18:20 UTC is still Sunday in India
    setNow('2026-10-11T18:20:00.000Z');
    const result = await report('week');
    expect(result).toMatchObject({ today: '2026-10-11', start: '2026-10-05' });
  });

  it('month runs from the 1st to the last day (31 days)', async () => {
    const result = await report('month');
    expect(result).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(result.days).toHaveLength(31);
    expect(result.previous).toMatchObject({ start: '2026-09-01', end: '2026-09-15' });
  });

  it('a 28-day February, and a leap-year February with 29 days', async () => {
    setNow('2026-02-10T06:30:00.000Z');
    const plain = await report('month');
    expect(plain).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
    expect(plain.days).toHaveLength(28);
    expect(plain.previous).toMatchObject({ start: '2026-01-01', end: '2026-01-10' });
    setNow('2028-02-10T06:30:00.000Z');
    const leap = await report('month');
    expect(leap.end).toBe('2028-02-29');
    expect(leap.days).toHaveLength(29);
  });

  it('the previous month is cut to its own length when it is shorter', async () => {
    setNow('2026-03-31T06:30:00.000Z');
    expect((await report('month')).previous).toMatchObject({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    setNow('2026-05-31T06:30:00.000Z');
    expect((await report('month')).previous).toMatchObject({
      start: '2026-04-01',
      end: '2026-04-30',
    });
  });

  it('January looks back to December of the year before', async () => {
    setNow('2026-01-05T06:30:00.000Z');
    expect((await report('month')).previous).toMatchObject({
      start: '2025-12-01',
      end: '2025-12-05',
    });
  });

  it('answers zeros for an empty database', async () => {
    for (const period of ['week', 'month'] as const) {
      const result = await report(period);
      expect(result.days).toHaveLength(period === 'week' ? 7 : 31);
      expect(
        result.days.every((day) => day.done + day.onTime + day.late + day.noDueDate === 0),
      ).toBe(true);
      expect(result.totals).toEqual({ done: 0, onTime: 0, late: 0, noDueDate: 0, added: 0 });
      expect(result.previous).toMatchObject({
        done: 0,
        onTime: 0,
        late: 0,
        noDueDate: 0,
        added: 0,
      });
      expect(result).toMatchObject({ overdueNow: 0, byTag: [], otherTagsDone: 0, noTagDone: 0 });
    }
  });
});

describe('tasks.report done, on time and late', () => {
  it('counts a task done at 00:10 IST on the India day, not the UTC day', async () => {
    // 18:40 UTC on 13 Oct is 00:10 IST on 14 Oct
    await done('2026-10-13T18:40:00.000Z');
    const result = await report('week');
    expect(result.days.find((day) => day.date === '2026-10-14')?.done).toBe(1);
    expect(result.days.find((day) => day.date === '2026-10-13')?.done).toBe(0);
    // 18:20 UTC on 11 Oct is 23:50 IST on Sunday 11 Oct: the previous week
    await done('2026-10-11T18:20:00.000Z');
    expect((await report('week')).totals.done).toBe(1);
  });

  it('splits on time, late and no due date', async () => {
    // due Wed 14 Oct (all day), done Thursday: late
    await done('2026-10-15T03:00:00.000Z', { dueAt: '2026-10-13T18:30:00.000Z' });
    // due Thursday 9:00, done Thursday 15:00: on time (same India day)
    await done('2026-10-15T09:30:00.000Z', { dueAt: '2026-10-15T03:30:00.000Z' });
    // due Friday all day, done Thursday: on time
    await done('2026-10-15T03:00:00.000Z', { dueAt: '2026-10-15T18:30:00.000Z' });
    // no due date
    await done('2026-10-14T03:00:00.000Z');
    const result = await report('week');
    expect(result.totals).toMatchObject({ done: 4, onTime: 2, late: 1, noDueDate: 1 });
    expect(result.days.find((day) => day.date === '2026-10-15')).toMatchObject({
      done: 3,
      onTime: 2,
      late: 1,
      noDueDate: 0,
    });
    expect(result.days.find((day) => day.date === '2026-10-14')).toMatchObject({
      done: 1,
      noDueDate: 1,
    });
  });

  it('a task due at 23:30 IST and done at 00:10 IST the next day is late', async () => {
    await done('2026-10-14T18:40:00.000Z', { dueAt: '2026-10-14T18:00:00.000Z' });
    expect((await report('week')).totals).toMatchObject({ done: 1, onTime: 0, late: 1 });
  });

  it('does not count reopened tasks (completed_at cleared) or open tasks', async () => {
    await seed({ status: 'todo', completedAt: null });
    await seed({ status: 'doing' });
    expect((await report('week')).totals.done).toBe(0);
  });

  it('counts each repeating copy as its own row', async () => {
    await done('2026-10-13T03:00:00.000Z', { dueAt: '2026-10-13T18:30:00.000Z' });
    await done('2026-10-14T03:00:00.000Z', { dueAt: '2026-10-14T18:30:00.000Z' });
    const result = await report('week');
    expect(result.totals.done).toBe(2);
  });

  it('leaves out subtasks and deleted tasks, keeps archived ones', async () => {
    const parent = await seed();
    await done('2026-10-15T03:00:00.000Z', {
      parentTaskId: parent,
      createdAt: '2026-10-14T03:00:00.000Z',
    });
    await done('2026-10-15T03:00:00.000Z', { deletedAt: '2026-10-15T04:00:00.000Z' });
    await done('2026-10-15T03:00:00.000Z', { archivedAt: '2026-10-15T05:00:00.000Z' });
    const result = await report('week');
    expect(result.totals).toMatchObject({ done: 1, added: 0 });
  });

  it('counts the previous period up to the same point only', async () => {
    await done('2026-10-05T03:00:00.000Z', { dueAt: '2026-10-04T18:30:00.000Z' });
    await done('2026-10-08T18:00:00.000Z'); // 23:30 IST Thursday 8 Oct: inside
    await done('2026-10-08T18:40:00.000Z'); // 00:10 IST Friday 9 Oct: after the same point
    await done('2026-10-04T03:00:00.000Z'); // Sunday before: outside
    const result = await report('week');
    expect(result.previous).toMatchObject({ done: 2, onTime: 1, noDueDate: 1, late: 0 });
    expect(result.totals.done).toBe(0);
  });

  it('counts the previous month with a cut-off at the same day of the month', async () => {
    await done('2026-09-15T12:00:00.000Z');
    await done('2026-09-16T03:00:00.000Z');
    await done('2026-08-31T12:00:00.000Z');
    expect((await report('month')).previous).toMatchObject({ done: 1 });
  });
});

describe('tasks.report added', () => {
  it('counts tasks created in the period by India day, any status, archived too', async () => {
    await seed({ createdAt: '2026-10-11T18:40:00.000Z' }); // Monday 00:10 IST: this week
    await seed({ createdAt: '2026-10-11T18:20:00.000Z' }); // Sunday: previous week, after its cut-off
    await seed({ status: 'doing', createdAt: '2026-10-14T03:00:00.000Z' });
    await done('2026-10-14T05:00:00.000Z', { createdAt: '2026-10-14T03:00:00.000Z' });
    await seed({ createdAt: '2026-10-14T03:00:00.000Z', archivedAt: '2026-10-15T03:00:00.000Z' });
    await seed({ createdAt: '2026-10-14T03:00:00.000Z', deletedAt: '2026-10-15T03:00:00.000Z' });
    await seed({ createdAt: '2026-10-06T03:00:00.000Z' }); // previous week, inside
    const result = await report('week');
    expect(result.totals.added).toBe(4);
    expect(result.previous.added).toBe(1);
  });
});

describe('tasks.report overdue now', () => {
  it('counts open top-level tasks whose due day is before today, not archived or deleted', async () => {
    await seed({ dueAt: '2026-10-13T18:30:00.000Z' }); // due 14 Oct all day: overdue
    await seed({ status: 'doing', dueAt: '2025-01-01T03:00:00.000Z' }); // long ago: overdue
    await seed({ dueAt: '2026-10-15T03:30:00.000Z' }); // today 9:00: not overdue
    await seed({ dueAt: '2026-10-14T18:20:00.000Z' }); // 23:50 IST on the 14th: overdue
    await seed({ dueAt: '2026-10-14T18:30:00.000Z' }); // 00:00 IST on the 15th: today
    await seed({ dueAt: null });
    await done('2026-10-14T03:00:00.000Z', { dueAt: '2026-10-10T03:00:00.000Z' });
    await seed({ dueAt: '2026-10-10T03:00:00.000Z', archivedAt: '2026-10-11T03:00:00.000Z' });
    await seed({ dueAt: '2026-10-10T03:00:00.000Z', deletedAt: '2026-10-11T03:00:00.000Z' });
    const parent = await seed();
    await seed({ dueAt: '2026-10-10T03:00:00.000Z', parentTaskId: parent });
    expect((await report('week')).overdueNow).toBe(3);
    expect((await report('month')).overdueNow).toBe(3);
  });
});

describe('tasks.report by tag', () => {
  it('lists the top 5 tags, then other tags and no tag, counting a task once per tag', async () => {
    const names = ['alpha', 'Bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'];
    const ids: string[] = [];
    for (const name of names) ids.push(await tag(name));
    const [alpha, bravo, charlie, delta, echo, foxtrot, golf] = ids as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const when = '2026-10-14T03:00:00.000Z';
    // alpha: 3 tasks, bravo: 2, charlie and delta: 2 each (ties by name), echo: 1, foxtrot: 1, golf: 1
    const first = await done(when);
    await tagTask(first, alpha, bravo); // a task with two tags counts once in each
    const second = await done(when);
    await tagTask(second, alpha, charlie);
    const third = await done(when);
    await tagTask(third, alpha, delta);
    const fourth = await done(when);
    await tagTask(fourth, bravo, charlie, delta);
    const fifth = await done(when);
    await tagTask(fifth, echo);
    const sixth = await done(when);
    await tagTask(sixth, foxtrot);
    const seventh = await done(when);
    await tagTask(seventh, golf, foxtrot); // has foxtrot too: not "other" only if foxtrot is in the top 5
    await done(when); // no tag
    const result = await report('week');
    expect(result.byTag.map((row) => [row.name, row.done])).toEqual([
      ['alpha', 3],
      ['Bravo', 2],
      ['charlie', 2],
      ['delta', 2],
      ['foxtrot', 2],
    ]);
    // golf-only tasks are none (the seventh also has foxtrot); echo's task has only echo: 1 other
    expect(result.otherTagsDone).toBe(1);
    expect(result.noTagDone).toBe(1);
    expect(result.totals.done).toBe(8);
  });

  it('counts a task with only tags outside the top 5 once, even with two of them', async () => {
    const top: string[] = [];
    for (const name of ['a', 'b', 'c', 'd', 'e']) top.push(await tag(name));
    const x = await tag('x');
    const y = await tag('y');
    const when = '2026-10-14T03:00:00.000Z';
    for (const id of top) {
      const a = await done(when);
      const b = await done(when);
      await tagTask(a, id);
      await tagTask(b, id);
    }
    await tagTask(await done(when), x, y);
    const result = await report('week');
    expect(result.byTag).toHaveLength(5);
    expect(result.otherTagsDone).toBe(1);
  });

  it('ignores deleted tags and tags of tasks done outside the period', async () => {
    const live = await tag('live');
    const gone = await tag('gone', ALICE, '2026-10-10T00:00:00.000Z');
    const inside = await done('2026-10-14T03:00:00.000Z');
    await tagTask(inside, gone);
    const outside = await done('2026-10-01T03:00:00.000Z');
    await tagTask(outside, live);
    const result = await report('week');
    expect(result.byTag).toEqual([]);
    expect(result.noTagDone).toBe(1);
  });

  it('breaks ties by name without regard to case, then by id', async () => {
    const lowerB = await tag('b');
    const upperA = await tag('A');
    const when = '2026-10-14T03:00:00.000Z';
    await tagTask(await done(when), lowerB);
    await tagTask(await done(when), upperA);
    const result = await report('week');
    expect(result.byTag.map((row) => row.name)).toEqual(['A', 'b']);
    expect(result.byTag[0]).toMatchObject({ tagId: upperA, color: '#F7D96B' });
  });
});

describe('tasks.report rules', () => {
  it('has the read permission and rejects bad input', async () => {
    expect(registry.permissionOf('tasks.report')).toBe('read');
    await expect(
      registry.run(context(ALICE), 'tasks.report', { period: 'year' }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(registry.run(context(ALICE), 'tasks.report', {})).rejects.toBeInstanceOf(ZodError);
  });

  it('runs without confirmation and gives no undo', async () => {
    const outcome = await registry.run(
      { ...context(ALICE), source: 'ai', confirmed: false },
      'tasks.report',
      { period: 'week' },
    );
    expect(outcome.undo ?? null).toBeNull();
  });

  it("never counts another user's tasks", async () => {
    const bobTag = await tag('bobs', BOB);
    const bobTask = await seed({
      userId: BOB,
      status: 'done',
      completedAt: '2026-10-14T03:00:00.000Z',
      createdAt: '2026-10-14T03:00:00.000Z',
    });
    await t.db.insert(entityTags).values({ userId: BOB, entityId: bobTask, tagId: bobTag });
    await seed({ userId: BOB, dueAt: '2026-10-01T03:00:00.000Z' });
    const mine = await report('week');
    expect(mine.totals).toEqual({ done: 0, onTime: 0, late: 0, noDueDate: 0, added: 0 });
    expect(mine).toMatchObject({ overdueNow: 0, byTag: [], noTagDone: 0 });
    const theirs = await report('week', BOB);
    expect(theirs.totals).toMatchObject({ done: 1, added: 1 });
    expect(theirs.overdueNow).toBe(1);
    expect(theirs.byTag.map((row) => row.name)).toEqual(['bobs']);
  });
});
