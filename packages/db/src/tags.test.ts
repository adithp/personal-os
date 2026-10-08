import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { entities, entityTags, tags, tasks } from './schema';
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
  await t.db.execute(
    sql`truncate table entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
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

async function tag(userId: string, name: string) {
  const [row] = await t.db.insert(tags).values({ userId, name, color: '#F7D96B' }).returning();
  if (!row) throw new Error('tag insert failed');
  return row;
}

async function task(userId: string, title = 'A task') {
  const [entity] = await t.db.insert(entities).values({ userId, type: 'task', title }).returning();
  if (!entity) throw new Error('entity insert failed');
  await t.db.insert(tasks).values({ id: entity.id, userId, title });
  return entity;
}

describe('tags', () => {
  it('has one live tag per name for a user, ignoring case', async () => {
    await tag(ALICE, 'Work');
    expect(await dbError(tag(ALICE, 'work'))).toContain('tags_user_name_idx');
    // another user can use the same name
    await tag(BOB, 'Work');
  });

  it('allows the name again once the old tag is soft-deleted', async () => {
    const old = await tag(ALICE, 'Home');
    await t.db.execute(sql`update tags set deleted_at = now() where id = ${old.id}`);
    await tag(ALICE, 'Home');
  });

  it('refreshes updated_at on every update', async () => {
    const row = await tag(ALICE, 'Fresh');
    await t.db.execute(
      sql`update tags set updated_at = '2000-01-01', name = 'Fresher' where id = ${row.id}`,
    );
    const after = (await t.pg.query<{ updated_at: Date }>('select updated_at from tags')).rows[0];
    expect(after?.updated_at.getFullYear()).toBeGreaterThan(2000);
  });
});

describe('entity_tags', () => {
  it('puts a tag on a task, once', async () => {
    const work = await tag(ALICE, 'Work');
    const item = await task(ALICE);
    await t.db.insert(entityTags).values({ userId: ALICE, entityId: item.id, tagId: work.id });
    expect(
      await dbError(
        t.db.insert(entityTags).values({ userId: ALICE, entityId: item.id, tagId: work.id }),
      ),
    ).toContain('entity_tags_entity_tag_key');
  });

  it('refuses another user’s tag or another user’s item (enforced by the database)', async () => {
    const bobsTag = await tag(BOB, 'Bobs');
    const aliceItem = await task(ALICE);
    expect(
      await dbError(
        t.db
          .insert(entityTags)
          .values({ userId: ALICE, entityId: aliceItem.id, tagId: bobsTag.id }),
      ),
    ).toContain('entity_tags_tag_fk');
    const aliceTag = await tag(ALICE, 'Mine');
    const bobItem = await task(BOB);
    expect(
      await dbError(
        t.db.insert(entityTags).values({ userId: ALICE, entityId: bobItem.id, tagId: aliceTag.id }),
      ),
    ).toContain('entity_tags_entity_fk');
  });

  it('removes the link when the task or the tag is deleted', async () => {
    const work = await tag(ALICE, 'Work');
    const first = await task(ALICE, 'one');
    const second = await task(ALICE, 'two');
    await t.db.insert(entityTags).values([
      { userId: ALICE, entityId: first.id, tagId: work.id },
      { userId: ALICE, entityId: second.id, tagId: work.id },
    ]);
    await t.db.execute(sql`delete from entities where id = ${first.id}`);
    expect((await t.pg.query('select id from entity_tags')).rows).toHaveLength(1);
    await t.db.execute(sql`delete from tags where id = ${work.id}`);
    expect((await t.pg.query('select id from entity_tags')).rows).toHaveLength(0);
  });
});

describe('Row Level Security on tags', () => {
  it('shows a user only their own tags and links', async () => {
    const mine = await tag(ALICE, 'Mine');
    await tag(BOB, 'Bobs');
    const item = await task(ALICE);
    await t.db.insert(entityTags).values({ userId: ALICE, entityId: item.id, tagId: mine.id });
    expect((await asRole(t.db, ALICE, (tx) => tx.select().from(tags))).map((r) => r.name)).toEqual([
      'Mine',
    ]);
    expect(await asRole(t.db, BOB, (tx) => tx.select().from(entityTags))).toEqual([]);
  });

  it('gives the anonymous role no access', async () => {
    const message = await dbError(asRole(t.db, null, (tx) => tx.select().from(tags)));
    expect(message.toLowerCase()).toContain('permission denied');
  });
});

describe('tasks.due_all_day', () => {
  it('is false by default and can be set', async () => {
    const item = await task(ALICE);
    const [before] = await t.db.select().from(tasks);
    expect(before?.dueAllDay).toBe(false);
    await t.db.execute(sql`update tasks set due_all_day = true where id = ${item.id}`);
    const [after] = await t.db.select().from(tasks);
    expect(after?.dueAllDay).toBe(true);
  });
});
