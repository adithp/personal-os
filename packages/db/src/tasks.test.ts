import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { entities, tasks } from './schema';
import { asRole, createTestDb, createTestUser, type TestDb } from './testing';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`truncate table links, tasks, entities, auth.users cascade`);
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

async function dbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    }
    return parts.join(' | ');
  }
  return '';
}

/** A task is an entity with the same id, so make the entity first. */
async function task(
  userId: string,
  title = 'Write report',
  values: Partial<typeof tasks.$inferInsert> = {},
) {
  const [entity] = await t.db.insert(entities).values({ userId, type: 'task', title }).returning();
  if (!entity) throw new Error('entity insert failed');
  const [row] = await t.db
    .insert(tasks)
    .values({ id: entity.id, userId, title, ...values })
    .returning();
  if (!row) throw new Error('task insert failed');
  return row;
}

describe('tasks table', () => {
  it('has sensible defaults: todo, lowest priority, no dates', async () => {
    const row = await task(ALICE);
    expect(row).toMatchObject({
      status: 'todo',
      priority: 4,
      description: null,
      dueAt: null,
      reminderAt: null,
      recurrenceRule: null,
      parentTaskId: null,
      position: 0,
      completedAt: null,
      archivedAt: null,
      deletedAt: null,
    });
  });

  it('refuses a task without a matching entity of the same owner', async () => {
    const [entity] = await t.db
      .insert(entities)
      .values({ userId: BOB, type: 'task', title: 'Bobs' })
      .returning();
    const message = await dbError(
      t.db.insert(tasks).values({ id: entity?.id, userId: ALICE, title: 'Stolen' }),
    );
    expect(message).toContain('tasks_entity_fk');
  });

  it('refuses priorities outside 1 to 4 and unknown statuses', async () => {
    expect(await dbError(task(ALICE, 'x', { priority: 0 }))).toContain('tasks_priority_range');
    expect(await dbError(task(ALICE, 'x', { priority: 5 }))).toContain('tasks_priority_range');
    const message = await dbError(
      t.db.execute(
        sql`insert into tasks (id, user_id, title, status) values (gen_random_uuid(), ${ALICE}, 'x', 'later')`,
      ),
    );
    expect(message).toContain('task_status');
  });

  it('removes the task when its entity is deleted', async () => {
    const row = await task(ALICE);
    await t.db.execute(sql`delete from entities where id = ${row.id}`);
    expect((await t.pg.query('select id from tasks')).rows).toEqual([]);
  });

  it('removes tasks when the user is deleted', async () => {
    await task(ALICE);
    await t.db.execute(sql`delete from auth.users where id = ${ALICE}`);
    expect((await t.pg.query('select id from tasks')).rows).toEqual([]);
  });

  it('lets a subtask point at a task of the same owner only', async () => {
    const parent = await task(ALICE, 'Parent');
    const child = await task(ALICE, 'Child', { parentTaskId: parent.id });
    expect(child.parentTaskId).toBe(parent.id);
    const bobsParent = await task(BOB, 'Bobs parent');
    expect(await dbError(task(ALICE, 'Sneaky', { parentTaskId: bobsParent.id }))).toContain(
      'tasks_parent_fk',
    );
  });

  it('refuses a task that is its own parent', async () => {
    const row = await task(ALICE);
    const message = await dbError(
      t.db.execute(sql`update tasks set parent_task_id = id where id = ${row.id}`),
    );
    expect(message).toContain('tasks_not_own_parent');
  });

  it('refreshes updated_at on every update', async () => {
    const row = await task(ALICE);
    await t.db.execute(
      sql`update tasks set updated_at = '2000-01-01', title = 'New' where id = ${row.id}`,
    );
    const after = (
      await t.pg.query<{ updated_at: Date; created_at: Date }>(
        'select updated_at, created_at from tasks',
      )
    ).rows[0];
    expect(after?.updated_at.getFullYear()).toBeGreaterThan(2000);
    expect(after?.created_at.getTime()).toBe(row.createdAt.getTime());
  });
});

describe('Row Level Security on tasks', () => {
  it('lets a user see only their own tasks', async () => {
    await task(ALICE, 'Alice task');
    await task(BOB, 'Bob task');
    const seen = await asRole(t.db, ALICE, (tx) => tx.select().from(tasks));
    expect(seen.map((r) => r.title)).toEqual(['Alice task']);
  });

  it('refuses a task written for another user', async () => {
    const [entity] = await t.db
      .insert(entities)
      .values({ userId: BOB, type: 'task', title: 'x' })
      .returning();
    const message = await dbError(
      asRole(t.db, ALICE, (tx) =>
        tx.insert(tasks).values({ id: entity?.id, userId: BOB, title: 'x' }),
      ),
    );
    expect(message.toLowerCase()).toContain('row-level security');
  });

  it('gives the anonymous role no access', async () => {
    await task(ALICE);
    const message = await dbError(asRole(t.db, null, (tx) => tx.select().from(tasks)));
    expect(message.toLowerCase()).toContain('permission denied');
  });
});
