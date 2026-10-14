import { entities, links } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserScope, type Db, type UserScope } from './user-scope';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

let t: TestDb;
let alice: UserScope;
let bob: UserScope;

beforeAll(async () => {
  t = await createTestDb();
  // The backend connects as the database owner, which skips Row Level Security.
  // So these tests prove the helper alone keeps users apart.
  const db = t.db as unknown as Db;
  alice = createUserScope(db, ALICE);
  bob = createUserScope(db, BOB);
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`truncate table links, entities, auth.users cascade`);
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

async function seed() {
  const [a1, a2] = await alice.insert(entities, [
    { type: 'task', title: 'Alice one' },
    { type: 'note', title: 'Alice two' },
  ]);
  const [b1, b2] = await bob.insert(entities, [
    { type: 'task', title: 'Bob one' },
    { type: 'note', title: 'Bob two' },
  ]);
  if (!a1 || !a2 || !b1 || !b2) throw new Error('seed failed');
  return { a1, a2, b1, b2 };
}

describe('creating a scope', () => {
  it('needs a real user id (the id from the verified token)', () => {
    const db = t.db as unknown as Db;
    for (const bad of ['', 'alice', '123', 'not-a-uuid', ALICE + 'x', "x' OR '1'='1"]) {
      expect(() => createUserScope(db, bad)).toThrow();
    }
  });

  it('remembers its user', () => {
    expect(alice.userId).toBe(ALICE);
    expect(bob.userId).toBe(BOB);
  });
});

describe('reading: one user can never read another user’s rows', () => {
  it('returns only the user’s own rows', async () => {
    await seed();
    const titles = async (scope: UserScope) =>
      (await scope.select(entities, { orderBy: entities.title })).map((r) => r.title);
    expect(await titles(alice)).toEqual(['Alice one', 'Alice two']);
    expect(await titles(bob)).toEqual(['Bob one', 'Bob two']);
  });

  it('returns nothing when asking for another user’s row by id', async () => {
    const { a1 } = await seed();
    expect(await bob.select(entities, { where: eq(entities.id, a1.id) })).toEqual([]);
  });

  it('cannot be widened by an OR in the extra condition', async () => {
    const { a1 } = await seed();
    const rows = await bob.select(entities, {
      where: or(eq(entities.userId, ALICE), eq(entities.id, a1.id), sql`true`),
    });
    expect(rows.map((r) => r.userId)).toEqual([BOB, BOB]);
  });

  it('cannot be widened by asking for the other user’s id', async () => {
    await seed();
    expect(await bob.select(entities, { where: eq(entities.userId, ALICE) })).toEqual([]);
  });

  it('cannot be widened with an injection-style search', async () => {
    await seed();
    const rows = await bob.select(entities, { where: ilike(entities.title, "%' OR 1=1 --") });
    expect(rows).toEqual([]);
  });

  it('supports ordering, limit and offset', async () => {
    await seed();
    const page = await alice.select(entities, { orderBy: entities.title, limit: 1, offset: 1 });
    expect(page.map((r) => r.title)).toEqual(['Alice two']);
  });

  it('can hide soft-deleted rows', async () => {
    const { a1 } = await seed();
    await alice.softDelete(entities, eq(entities.id, a1.id));
    const live = await alice.select(entities, { where: alice.isLive(entities) });
    const all = await alice.select(entities);
    expect(live).toHaveLength(1);
    expect(all).toHaveLength(2);
  });

  it('builds a condition that always includes the owner', async () => {
    const { a1 } = await seed();
    const condition = bob.where(entities, eq(entities.id, a1.id));
    const rows = await t.db.select().from(entities).where(condition);
    expect(rows).toEqual([]);
  });
});

describe('selectFields: chosen columns and computed values stay inside the user', () => {
  it('returns only the user’s own rows, with the chosen columns and computed values', async () => {
    const { a1 } = await seed();
    const rows = await alice.selectFields(
      entities,
      { id: entities.id, shout: sql<string>`upper(${entities.title})` },
      { orderBy: entities.title },
    );
    expect(rows).toEqual([
      { id: a1.id, shout: 'ALICE ONE' },
      { id: expect.any(String) as string, shout: 'ALICE TWO' },
    ]);
  });

  it('never returns another user’s rows, however the extra condition is written', async () => {
    const { a1 } = await seed();
    const fields = { id: entities.id, userId: entities.userId };
    expect(await bob.selectFields(entities, fields, { where: eq(entities.id, a1.id) })).toEqual([]);
    const widened = await bob.selectFields(entities, fields, {
      where: or(eq(entities.userId, ALICE), sql`true`),
    });
    expect(widened.map((r) => r.userId)).toEqual([BOB, BOB]);
  });

  it('supports ordering, limit and offset', async () => {
    await seed();
    const page = await alice.selectFields(
      entities,
      { title: entities.title },
      { orderBy: entities.title, limit: 1, offset: 1 },
    );
    expect(page).toEqual([{ title: 'Alice two' }]);
  });
});

describe('creating: rows always belong to the signed-in user', () => {
  it('stamps the user on new rows and returns them', async () => {
    const [row] = await alice.insert(entities, { type: 'task', title: 'Mine' });
    expect(row).toMatchObject({ userId: ALICE, title: 'Mine', type: 'task' });
  });

  it('replaces a user id smuggled into the input', async () => {
    const sneaky = { type: 'task', title: 'Planted', userId: BOB } as unknown as {
      type: 'task';
      title: string;
    };
    const [row] = await alice.insert(entities, sneaky);
    expect(row?.userId).toBe(ALICE);
    expect(await bob.select(entities)).toEqual([]);
  });

  it('replaces a smuggled user id in every row of a batch', async () => {
    const batch = [
      { type: 'task', title: 'One', userId: BOB },
      { type: 'task', title: 'Two', userId: BOB },
    ] as unknown as { type: 'task'; title: string }[];
    const rows = await alice.insert(entities, batch);
    expect(rows.map((r) => r.userId)).toEqual([ALICE, ALICE]);
  });

  it('does nothing for an empty list', async () => {
    expect(await alice.insert(entities, [])).toEqual([]);
  });

  it('refuses a link to another user’s item', async () => {
    const { a1, b1 } = await seed();
    await expect(
      alice.insert(links, { sourceId: a1.id, targetId: b1.id, relation: 'related' }),
    ).rejects.toThrow();
    expect(await alice.select(links)).toEqual([]);
  });

  it('creates a link between the user’s own items', async () => {
    const { a1, a2 } = await seed();
    const [link] = await alice.insert(links, {
      sourceId: a1.id,
      targetId: a2.id,
      relation: 'blocks',
    });
    expect(link).toMatchObject({ userId: ALICE, relation: 'blocks' });
  });
});

describe('changing: one user can never change another user’s rows', () => {
  it('updates the user’s own rows and returns them', async () => {
    const { a1 } = await seed();
    const updated = await alice.update(entities, { title: 'Renamed' }, eq(entities.id, a1.id));
    expect(updated.map((r) => r.title)).toEqual(['Renamed']);
  });

  it('touches nothing when the row belongs to someone else', async () => {
    const { a1 } = await seed();
    const updated = await bob.update(entities, { title: 'Hacked' }, eq(entities.id, a1.id));
    expect(updated).toEqual([]);
    const [still] = await t.db.select().from(entities).where(eq(entities.id, a1.id));
    expect(still?.title).toBe('Alice one');
  });

  it('cannot update every row of another user with a broad condition', async () => {
    await seed();
    await bob.update(entities, { title: 'Hacked' }, sql`true`);
    const aliceTitles = (await alice.select(entities, { orderBy: entities.title })).map(
      (r) => r.title,
    );
    expect(aliceTitles).toEqual(['Alice one', 'Alice two']);
  });

  it('ignores a user id in the update, so a row cannot be given away', async () => {
    const { a1 } = await seed();
    const sneaky = { title: 'Gift', userId: BOB } as unknown as { title: string };
    const [row] = await alice.update(entities, sneaky, eq(entities.id, a1.id));
    expect(row).toMatchObject({ userId: ALICE, title: 'Gift' });
    expect(await bob.select(entities, { where: eq(entities.id, a1.id) })).toEqual([]);
  });

  it('ignores an id in the update, so a row keeps its identity', async () => {
    const { a1, a2 } = await seed();
    const sneaky = { title: 'Same id', id: a2.id } as unknown as { title: string };
    const [row] = await alice.update(entities, sneaky, eq(entities.id, a1.id));
    expect(row?.id).toBe(a1.id);
  });

  it('refreshes updated_at', async () => {
    const { a1 } = await seed();
    await new Promise((resolve) => setTimeout(resolve, 15));
    const [row] = await alice.update(entities, { title: 'Later' }, eq(entities.id, a1.id));
    expect(row?.updatedAt.getTime()).toBeGreaterThan(a1.updatedAt.getTime());
  });
});

describe('deleting: one user can never delete another user’s rows', () => {
  it('deletes the user’s own row', async () => {
    const { a1 } = await seed();
    const deleted = await alice.delete(entities, eq(entities.id, a1.id));
    expect(deleted).toHaveLength(1);
    expect(await alice.select(entities)).toHaveLength(1);
  });

  it('deletes nothing when the row belongs to someone else', async () => {
    const { a1 } = await seed();
    expect(await bob.delete(entities, eq(entities.id, a1.id))).toEqual([]);
    expect(await alice.select(entities)).toHaveLength(2);
  });

  it('cannot wipe another user’s data with a broad condition', async () => {
    await seed();
    await bob.delete(entities, sql`true`);
    expect(await alice.select(entities)).toHaveLength(2);
    expect(await bob.select(entities)).toEqual([]);
  });

  it('soft delete marks only the user’s own rows', async () => {
    const { a1, b1 } = await seed();
    expect(await bob.softDelete(entities, eq(entities.id, a1.id))).toEqual([]);
    const [marked] = await alice.softDelete(entities, eq(entities.id, a1.id));
    expect(marked?.deletedAt).toBeInstanceOf(Date);
    const [bobsRow] = await t.db.select().from(entities).where(eq(entities.id, b1.id));
    expect(bobsRow?.deletedAt).toBeNull();
  });

  it('soft delete cannot be widened to another user’s rows', async () => {
    await seed();
    await bob.softDelete(entities, or(sql`true`, eq(entities.userId, ALICE)) ?? sql`true`);
    const aliceLive = await alice.select(entities, { where: alice.isLive(entities) });
    expect(aliceLive).toHaveLength(2);
  });
});

describe('every operation, for every pair of users: the other user’s row is untouched', () => {
  it('survives read, update, delete, and soft delete attempts by the other user', async () => {
    const { a1 } = await seed();
    const attacker = bob;
    const byId = eq(entities.id, a1.id);

    expect(await attacker.select(entities, { where: byId })).toEqual([]);
    expect(await attacker.update(entities, { title: 'x', type: 'tag' }, byId)).toEqual([]);
    expect(await attacker.softDelete(entities, byId)).toEqual([]);
    expect(await attacker.delete(entities, byId)).toEqual([]);

    const [row] = await t.db.select().from(entities).where(and(byId));
    expect(row).toMatchObject({ title: 'Alice one', type: 'task', userId: ALICE, deletedAt: null });
  });
});

describe('transactions', () => {
  it('commits all queries together under the same scope', async () => {
    await alice.transaction(async (scope) => {
      expect(scope.userId).toBe(ALICE);
      await scope.insert(entities, { type: 'task', title: 'In tx 1' });
      await scope.insert(entities, { type: 'task', title: 'In tx 2' });
    });
    expect(await alice.select(entities)).toHaveLength(2);
  });

  it('rolls everything back when something fails', async () => {
    await expect(
      alice.transaction(async (scope) => {
        await scope.insert(entities, { type: 'task', title: 'Will vanish' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await alice.select(entities)).toEqual([]);
  });

  it('keeps the user separation inside a transaction', async () => {
    const { b1 } = await seed();
    await alice.transaction(async (scope) => {
      expect(await scope.select(entities, { where: eq(entities.id, b1.id) })).toEqual([]);
      expect(await scope.update(entities, { title: 'x' }, eq(entities.id, b1.id))).toEqual([]);
    });
    const [still] = await t.db.select().from(entities).where(eq(entities.id, b1.id));
    expect(still?.title).toBe('Bob one');
  });
});
