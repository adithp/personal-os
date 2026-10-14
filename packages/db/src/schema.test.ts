import { ENTITY_TYPES, LINK_RELATIONS, REALTIME_TABLES } from '@personal-os/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { entities, goals, links, taskFavorites, tasks } from './schema';
import {
  asRole,
  createTestDb,
  createTestUser,
  migrationFiles,
  migrationStatements,
  type TestDb,
} from './testing';

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

/** Collects the message of a database error, including the underlying Postgres message. */
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

const rows = async (query: string) => (await t.pg.query<Record<string, unknown>>(query)).rows;

async function entity(
  userId: string,
  title = 'Item',
  type: (typeof ENTITY_TYPES)[number] = 'task',
) {
  const [row] = await t.db.insert(entities).values({ userId, type, title }).returning();
  if (!row) throw new Error('insert failed');
  return row;
}

describe('the generated migrations', () => {
  it('has the migrations in order, and they never drop or empty anything', () => {
    expect(migrationFiles()).toEqual([
      '0000_entities_and_links.sql',
      '0001_updated_at_trigger.sql',
      '0002_tasks_table.sql',
      '0003_tasks_updated_at_trigger.sql',
      '0004_tags_and_all_day.sql',
      '0005_tags_updated_at_trigger.sql',
      '0006_task_favorites_table.sql',
      '0007_task_favorites_updated_at_trigger.sql',
      '0008_goals.sql',
      '0009_goals_updated_at_trigger.sql',
      '0010_tasks_search_vector.sql',
      '0011_realtime_publication.sql',
    ]);
    const all = migrationFiles().flatMap(migrationStatements).join('\n').toUpperCase();
    for (const dangerous of [
      'DROP TABLE',
      'DROP SCHEMA',
      'TRUNCATE',
      'DELETE FROM',
      'DROP POLICY',
    ]) {
      expect(all).not.toContain(dangerous);
    }
  });

  it('applied cleanly to an empty database', async () => {
    const tables = await rows(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(tables.map((r) => r.tablename)).toEqual([
      'entities',
      'entity_tags',
      'goals',
      'links',
      'tags',
      'task_favorites',
      'tasks',
    ]);
  });
});

describe('docs/DATABASE.md rules', () => {
  it.each(['entities', 'links'])('%s has the standard columns', async (table) => {
    const columns = await rows(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = '${table}'`,
    );
    const byName = Object.fromEntries(columns.map((c) => [String(c.column_name), c])) as Record<
      string,
      Record<string, unknown>
    >;
    expect(byName.id).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    expect(byName.user_id).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    expect(byName.created_at).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
    expect(byName.updated_at).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
    expect(byName.deleted_at).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'YES',
    });
  });

  it('links has updated_at and deleted_at (decision 16)', async () => {
    const columns = await rows(
      "select column_name from information_schema.columns where table_name = 'links'",
    );
    const names = columns.map((c) => c.column_name);
    expect(names).toEqual(expect.arrayContaining(['updated_at', 'deleted_at']));
  });

  it('entities has a nullable full-text search_vector with a GIN index', async () => {
    const column = await rows(
      `select data_type, is_nullable from information_schema.columns
       where table_name = 'entities' and column_name = 'search_vector'`,
    );
    expect(column[0]).toMatchObject({ data_type: 'tsvector', is_nullable: 'YES' });
    const index = await rows(
      "select indexdef from pg_indexes where indexname = 'entities_search_vector_idx'",
    );
    expect(String(index[0]?.indexdef)).toContain('USING gin');
  });

  it('has the indexes the queries need', async () => {
    const names = (await rows("select indexname from pg_indexes where schemaname = 'public'")).map(
      (r) => r.indexname,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'entities_user_id_idx',
        'entities_user_type_idx',
        'links_user_id_idx',
        'links_source_id_idx',
        'links_target_id_idx',
        'links_unique_active_idx',
      ]),
    );
  });

  it('uses the same entity types and relations as packages/shared', async () => {
    const types = await rows(
      "select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'entity_type' order by e.enumsortorder",
    );
    const relations = await rows(
      "select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'link_relation' order by e.enumsortorder",
    );
    expect(types.map((r) => r.enumlabel)).toEqual([...ENTITY_TYPES]);
    expect(relations.map((r) => r.enumlabel)).toEqual([...LINK_RELATIONS]);
  });

  it('rejects an entity with an unknown type', async () => {
    expect(
      await dbError(
        t.pg.query(
          `insert into entities (user_id, type, title) values ('${ALICE}', 'spaceship', 'x')`,
        ),
      ),
    ).toMatch(/invalid input value for enum/);
  });

  it('rejects an entity for a user that does not exist', async () => {
    const message = await dbError(
      t.db
        .insert(entities)
        .values({ userId: '11111111-1111-4111-8111-111111111111', type: 'note', title: 'x' }),
    );
    expect(message).toMatch(/foreign key/i);
  });

  it('removes a user’s entities and links when the user is deleted', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    await t.db
      .insert(links)
      .values({ userId: ALICE, sourceId: a.id, targetId: b.id, relation: 'related' });

    await t.db.execute(sql`delete from auth.users where id = ${ALICE}`);
    expect(await t.db.select().from(entities)).toHaveLength(0);
    expect(await t.db.select().from(links)).toHaveLength(0);
  });
});

describe('Row Level Security is on, with an own-rows policy', () => {
  it('is enabled on every table', async () => {
    const result = await rows(
      "select relname, relrowsecurity from pg_class where relname in ('entities','entity_tags','goals','links','tags','task_favorites','tasks') order by relname",
    );
    expect(result).toEqual([
      { relname: 'entities', relrowsecurity: true },
      { relname: 'entity_tags', relrowsecurity: true },
      { relname: 'goals', relrowsecurity: true },
      { relname: 'links', relrowsecurity: true },
      { relname: 'tags', relrowsecurity: true },
      { relname: 'task_favorites', relrowsecurity: true },
      { relname: 'tasks', relrowsecurity: true },
    ]);
  });

  it('has one policy per table, for the authenticated role, comparing user_id with auth.uid()', async () => {
    const policies = await rows(
      "select tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename",
    );
    expect(policies.map((p) => p.tablename)).toEqual([
      'entities',
      'entity_tags',
      'goals',
      'links',
      'tags',
      'task_favorites',
      'tasks',
    ]);
    for (const policy of policies) {
      expect(policy.roles).toEqual(['authenticated']);
      expect(policy.cmd).toBe('ALL');
      expect(String(policy.qual)).toContain('auth.uid()');
      expect(String(policy.qual)).toContain('user_id');
      expect(String(policy.with_check)).toContain('auth.uid()');
    }
  });
});

describe('RLS in action (what a signed-in app or Realtime can reach)', () => {
  it('lets a user read only their own rows', async () => {
    await entity(ALICE, 'Alice task');
    await entity(BOB, 'Bob task');

    const seenByAlice = await asRole(t.db, ALICE, (tx) => tx.select().from(entities));
    const seenByBob = await asRole(t.db, BOB, (tx) => tx.select().from(entities));
    expect(seenByAlice.map((r) => r.title)).toEqual(['Alice task']);
    expect(seenByBob.map((r) => r.title)).toEqual(['Bob task']);
  });

  it('hides another user’s row even when asking for it by id', async () => {
    const bobs = await entity(BOB);
    const result = await asRole(t.db, ALICE, (tx) =>
      tx.select().from(entities).where(eq(entities.id, bobs.id)),
    );
    expect(result).toEqual([]);
  });

  it('hides soft-deleted rows of other users too', async () => {
    const bobs = await entity(BOB);
    await t.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.id, bobs.id));
    expect(await asRole(t.db, ALICE, (tx) => tx.select().from(entities))).toEqual([]);
  });

  it('lets a user create rows for themselves', async () => {
    const created = await asRole(t.db, ALICE, (tx) =>
      tx.insert(entities).values({ userId: ALICE, type: 'note', title: 'Mine' }).returning(),
    );
    expect(created).toHaveLength(1);
  });

  it('refuses a row created for another user', async () => {
    const message = await dbError(
      asRole(t.db, ALICE, (tx) =>
        tx.insert(entities).values({ userId: BOB, type: 'note', title: 'Planted' }),
      ),
    );
    expect(message).toMatch(/row-level security/i);
    expect(await t.db.select().from(entities)).toHaveLength(0);
  });

  it('cannot change or delete another user’s row', async () => {
    const bobs = await entity(BOB, 'Original');
    const updated = await asRole(t.db, ALICE, (tx) =>
      tx.update(entities).set({ title: 'Hacked' }).where(eq(entities.id, bobs.id)).returning(),
    );
    const deleted = await asRole(t.db, ALICE, (tx) =>
      tx.delete(entities).where(eq(entities.id, bobs.id)).returning(),
    );
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
    const [still] = await t.db.select().from(entities).where(eq(entities.id, bobs.id));
    expect(still?.title).toBe('Original');
  });

  it('cannot hand one of its own rows to another user', async () => {
    const mine = await entity(ALICE);
    const message = await dbError(
      asRole(t.db, ALICE, (tx) =>
        tx.update(entities).set({ userId: BOB }).where(eq(entities.id, mine.id)),
      ),
    );
    expect(message).toMatch(/row-level security/i);
    const [after] = await t.db.select().from(entities).where(eq(entities.id, mine.id));
    expect(after?.userId).toBe(ALICE);
  });

  it('protects links the same way', async () => {
    const a = await entity(BOB);
    const b = await entity(BOB);
    await t.db
      .insert(links)
      .values({ userId: BOB, sourceId: a.id, targetId: b.id, relation: 'related' });
    expect(await asRole(t.db, ALICE, (tx) => tx.select().from(links))).toEqual([]);
    expect(await asRole(t.db, BOB, (tx) => tx.select().from(links))).toHaveLength(1);
  });

  it('sees nothing with no login (no user id in the token)', async () => {
    await entity(ALICE);
    const seen = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`select set_config('request.jwt.claim.sub', '', true)`);
      return tx.select().from(entities);
    });
    expect(seen).toEqual([]);
  });

  it('gives the anonymous role no access at all', async () => {
    await entity(ALICE);
    const message = await dbError(asRole(t.db, null, (tx) => tx.select().from(entities)));
    expect(message).toMatch(/permission denied/i);
  });
});

describe('links can only join a user’s own items (enforced by the database)', () => {
  it('allows a link between two of the user’s own entities', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    const [link] = await t.db
      .insert(links)
      .values({ userId: ALICE, sourceId: a.id, targetId: b.id, relation: 'blocks' })
      .returning();
    expect(link).toMatchObject({
      userId: ALICE,
      sourceId: a.id,
      targetId: b.id,
      relation: 'blocks',
    });
  });

  it('refuses a link to another user’s entity, even for the backend (which skips RLS)', async () => {
    const mine = await entity(ALICE);
    const bobs = await entity(BOB);
    const toBob = await dbError(
      t.db
        .insert(links)
        .values({ userId: ALICE, sourceId: mine.id, targetId: bobs.id, relation: 'related' }),
    );
    expect(toBob).toMatch(/links_target_owner_fk/);
    const fromBob = await dbError(
      t.db
        .insert(links)
        .values({ userId: ALICE, sourceId: bobs.id, targetId: mine.id, relation: 'related' }),
    );
    expect(fromBob).toMatch(/links_source_owner_fk/);
  });

  it('refuses a link stamped with the wrong owner', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    const message = await dbError(
      t.db
        .insert(links)
        .values({ userId: BOB, sourceId: a.id, targetId: b.id, relation: 'related' }),
    );
    expect(message).toMatch(/links_(source|target)_owner_fk/);
  });

  it('refuses a link from an item to itself', async () => {
    const a = await entity(ALICE);
    const message = await dbError(
      t.db
        .insert(links)
        .values({ userId: ALICE, sourceId: a.id, targetId: a.id, relation: 'related' }),
    );
    expect(message).toMatch(/links_no_self_link/);
  });

  it('refuses the same live link twice, but allows other relations and the other direction', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    const link = { userId: ALICE, sourceId: a.id, targetId: b.id, relation: 'blocks' as const };
    await t.db.insert(links).values(link);

    expect(await dbError(t.db.insert(links).values(link))).toMatch(/links_unique_active_idx/);
    await t.db.insert(links).values({ ...link, relation: 'related' });
    await t.db.insert(links).values({ ...link, sourceId: b.id, targetId: a.id });
    expect(await t.db.select().from(links)).toHaveLength(3);
  });

  it('allows a new link once the old one is soft-deleted', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    const link = { userId: ALICE, sourceId: a.id, targetId: b.id, relation: 'mentions' as const };
    const [first] = await t.db.insert(links).values(link).returning();
    await t.db
      .update(links)
      .set({ deletedAt: new Date() })
      .where(eq(links.id, first?.id ?? ''));
    await t.db.insert(links).values(link);
    expect(await t.db.select().from(links)).toHaveLength(2);
  });

  it('removes links when an entity is deleted', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    await t.db
      .insert(links)
      .values({ userId: ALICE, sourceId: a.id, targetId: b.id, relation: 'related' });
    await t.db.delete(entities).where(eq(entities.id, a.id));
    expect(await t.db.select().from(links)).toHaveLength(0);
  });

  it('refuses an unknown relation', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    const message = await dbError(
      t.pg.query(
        `insert into links (user_id, source_id, target_id, relation) values ('${ALICE}', '${a.id}', '${b.id}', 'likes')`,
      ),
    );
    expect(message).toMatch(/invalid input value for enum/);
  });
});

describe('updated_at trigger', () => {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 15));

  it('refreshes updated_at on every update of an entity, and leaves created_at alone', async () => {
    const created = await entity(ALICE, 'Before');
    await pause();
    const [after] = await t.db
      .update(entities)
      .set({ title: 'After' })
      .where(eq(entities.id, created.id))
      .returning();
    expect(after?.title).toBe('After');
    expect(after?.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    expect(after?.createdAt.getTime()).toBe(created.createdAt.getTime());
  });

  it('cannot be overridden by sending an old updated_at', async () => {
    const created = await entity(ALICE);
    await pause();
    const [after] = await t.db
      .update(entities)
      .set({ title: 'x', updatedAt: new Date('2000-01-01') })
      .where(eq(entities.id, created.id))
      .returning();
    expect(after?.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });

  it('works on links too', async () => {
    const a = await entity(ALICE);
    const b = await entity(ALICE);
    const [link] = await t.db
      .insert(links)
      .values({ userId: ALICE, sourceId: a.id, targetId: b.id, relation: 'related' })
      .returning();
    await pause();
    const [after] = await t.db
      .update(links)
      .set({ deletedAt: new Date() })
      .where(and(eq(links.id, link?.id ?? '')))
      .returning();
    expect(after?.updatedAt.getTime()).toBeGreaterThan(link?.updatedAt.getTime() ?? 0);
  });
});

describe('task_favorites', () => {
  const favorite = (userId: string, name = 'Mine') => ({
    userId,
    name,
    color: '#F7D96B',
    icon: 'hash',
    view: { tagIds: ['3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091'] },
  });

  it('stores a view and refreshes updated_at on update', async () => {
    const [row] = await t.db.insert(taskFavorites).values(favorite(ALICE)).returning();
    expect(row?.view).toEqual({ tagIds: ['3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091'] });
    expect(row?.position).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const [after] = await t.db
      .update(taskFavorites)
      .set({ name: 'Renamed' })
      .where(eq(taskFavorites.id, row?.id ?? ''))
      .returning();
    expect(after?.updatedAt.getTime()).toBeGreaterThan(row?.updatedAt.getTime() ?? 0);
  });

  it('is deleted with its user', async () => {
    await t.db.insert(taskFavorites).values(favorite(ALICE));
    await t.db.execute(sql`truncate table auth.users cascade`);
    expect(await t.db.select().from(taskFavorites)).toHaveLength(0);
  });

  it('lets a user see and write only their own favorites', async () => {
    await t.db.insert(taskFavorites).values([favorite(ALICE, 'Alice'), favorite(BOB, 'Bob')]);
    const seen = await asRole(t.db, ALICE, (tx) => tx.select().from(taskFavorites));
    expect(seen.map((row) => row.name)).toEqual(['Alice']);
    const message = await dbError(
      asRole(t.db, ALICE, (tx) => tx.insert(taskFavorites).values(favorite(BOB, 'Planted'))),
    );
    expect(message).toMatch(/row-level security/i);
  });
});

describe('goals', () => {
  async function goal(userId: string, title = 'Learn Rust') {
    const entity = await t.db
      .insert(entities)
      .values({ userId, type: 'goal', title })
      .returning()
      .then((rows) => rows[0]);
    if (!entity) throw new Error('no entity');
    const [row] = await t.db.insert(goals).values({ id: entity.id, userId, title }).returning();
    if (!row) throw new Error('no goal');
    return row;
  }

  it('is an entity of type goal, active by default, deleted with its entity', async () => {
    const row = await goal(ALICE);
    expect(row.status).toBe('active');
    expect(row.closedAt).toBeNull();
    await t.db.delete(entities).where(eq(entities.id, row.id));
    expect(await t.db.select().from(goals)).toHaveLength(0);
  });

  it('accepts a belongs_to link from a task to a goal', async () => {
    const task = await entity(ALICE, 'A task');
    const row = await goal(ALICE);
    const [link] = await t.db
      .insert(links)
      .values({ userId: ALICE, sourceId: task.id, targetId: row.id, relation: 'belongs_to' })
      .returning();
    expect(link?.relation).toBe('belongs_to');
  });

  it('refreshes updated_at on update', async () => {
    const row = await goal(ALICE);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const [after] = await t.db
      .update(goals)
      .set({ status: 'achieved', closedAt: new Date() })
      .where(eq(goals.id, row.id))
      .returning();
    expect(after?.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
  });

  it('lets a user see only their own goals', async () => {
    await goal(ALICE, 'Mine');
    await goal(BOB, 'Theirs');
    const seen = await asRole(t.db, ALICE, (tx) => tx.select().from(goals));
    expect(seen.map((row) => row.title)).toEqual(['Mine']);
  });
});

describe('task search vector', () => {
  const vectorOf = async (id: string) =>
    String((await rows(`select search_vector::text as v from entities where id = '${id}'`))[0]?.v);

  async function task(title: string, description: string | null = null) {
    const e = await entity(ALICE, title);
    await t.db.insert(tasks).values({ id: e.id, userId: ALICE, title, description });
    return e.id;
  }

  it('fills the vector on insert: title weight A, description weight B', async () => {
    const id = await task('Pay rent', 'to Mr Nair');
    const vector = await vectorOf(id);
    expect(vector).toContain("'pay':1A");
    expect(vector).toContain("'rent':2A");
    expect(vector).toContain("'nair':");
    expect(vector).toMatch(/'nair':\d+B/);
  });

  it('updates on a title or description change, and the entity title stays as it is', async () => {
    const id = await task('Old title');
    await t.db.update(tasks).set({ title: 'Brand new' }).where(eq(tasks.id, id));
    expect(await vectorOf(id)).toContain("'brand'");
    await t.db.update(tasks).set({ description: 'extra words' }).where(eq(tasks.id, id));
    expect(await vectorOf(id)).toContain("'extra'");
  });

  it('matches word starts with a prefix query', async () => {
    const id = await task('Pay rent');
    const hit = await rows(
      `select 1 from entities where id = '${id}' and search_vector @@ to_tsquery('simple', 'pay:* & re:*')`,
    );
    expect(hit).toHaveLength(1);
  });

  it('uses the GIN index', async () => {
    for (let i = 0; i < 300; i++) await task(`Task number ${String(i)}`);
    await t.pg.query('analyze entities');
    await t.pg.query('set enable_seqscan = off');
    const plan = await rows(
      `explain select id from entities where search_vector @@ to_tsquery('simple', 'number:*')`,
    );
    await t.pg.query('reset enable_seqscan');
    expect(JSON.stringify(plan)).toContain('entities_search_vector_idx');
  });
});

describe('realtime publication', () => {
  it('publishes exactly the REALTIME_TABLES', async () => {
    const published = await rows(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename",
    );
    expect(published.map((r) => r.tablename)).toEqual([...REALTIME_TABLES].sort());
  });

  it('lets authenticated read and anon do nothing on those tables', async () => {
    for (const table of REALTIME_TABLES) {
      const [row] = await rows(
        `select has_table_privilege('authenticated', 'public.${table}', 'SELECT') as can_read,
                has_table_privilege('anon', 'public.${table}', 'SELECT') as anon_read,
                has_table_privilege('anon', 'public.${table}', 'DELETE') as anon_delete`,
      );
      expect(row, table).toEqual({ can_read: true, anon_read: false, anon_delete: false });
    }
  });

  it('can run twice without failing', async () => {
    for (const statement of migrationStatements('0011_realtime_publication.sql')) {
      await t.pg.exec(statement);
    }
  });
});
