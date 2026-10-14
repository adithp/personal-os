import { entities, tasks } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEARCH_CONFIG,
  hasSearchWords,
  matchEntities,
  prefixQuery,
  snippets,
  startsWith,
} from './search';
import { createUserScope } from './user-scope';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

let t: TestDb;
const alice = () => createUserScope(t.db, ALICE);
const bob = () => createUserScope(t.db, BOB);

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.db.execute(sql`truncate table tasks, entities, auth.users cascade`);
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

/** A task and its entity (the trigger fills the search vector). */
async function addTask(userId: string, title: string, description: string | null = null) {
  const scope = createUserScope(t.db, userId);
  const [entity] = await scope.insert(entities, { type: 'task', title });
  if (!entity) throw new Error('no entity');
  await scope.insert(tasks, { id: entity.id, title, description });
  return entity.id;
}

const titlesFor = async (text: string, scope = alice()) =>
  (await matchEntities(scope, { text, type: 'task', limit: 20 })).map((m) => m.title);

describe('the search configuration', () => {
  it('is the simple configuration of decision 42', () => {
    expect(SEARCH_CONFIG).toBe('simple');
  });
});

describe('hasSearchWords', () => {
  it('is true for letters, digits and Malayalam, false for punctuation and spaces', () => {
    expect(hasSearchWords('rent')).toBe(true);
    expect(hasSearchWords('42')).toBe(true);
    expect(hasSearchWords('വാടക')).toBe(true);
    expect(hasSearchWords('  ')).toBe(false);
    expect(hasSearchWords('& ( :* !')).toBe(false);
  });
});

describe('prefixQuery and matchEntities', () => {
  it('matches every typed word by its start, joined by AND', async () => {
    await addTask(ALICE, 'Pay rent to Mr. Nair');
    await addTask(ALICE, 'Pay electricity bill');
    expect(await titlesFor('pay re')).toEqual(['Pay rent to Mr. Nair']);
    expect(await titlesFor('PAY')).toHaveLength(2);
    expect(await titlesFor('rent pay')).toEqual(['Pay rent to Mr. Nair']);
    expect(await titlesFor('ent')).toEqual([]);
  });

  it('never fails on punctuation or operator characters', async () => {
    await addTask(ALICE, "O'Reilly book");
    await addTask(ALICE, 'Learn C++ basics');
    const hostile = ['foo & ( :* !', "o'reilly", 'C++', '\\', 'a\\b', '| ! <->', '"', ':*', '   '];
    for (const text of hostile) {
      await expect(titlesFor(text)).resolves.toBeDefined();
    }
    expect(await titlesFor("o'reilly")).toEqual(["O'Reilly book"]);
    expect(await titlesFor('c++')).toEqual(['Learn C++ basics']);
    expect(await titlesFor('& (')).toEqual([]);
  });

  it('survives a NUL byte', async () => {
    await addTask(ALICE, 'Pay rent');
    expect(await titlesFor('pay\u0000 re')).toEqual(['Pay rent']);
  });

  it('finds Malayalam words by their start', async () => {
    await addTask(ALICE, 'വാടക കൊടുക്കണം');
    expect(await titlesFor('വാടക')).toEqual(['വാടക കൊടുക്കണം']);
    expect(await titlesFor('വാ')).toEqual(['വാടക കൊടുക്കണം']);
  });

  it('gives an empty query for text without words', async () => {
    const result = await t.db.execute(sql`select ${prefixQuery('  & ! ')}::text as q`);
    expect((result.rows[0] as { q: string }).q).toBe('');
  });

  it('ranks a title match above a description match', async () => {
    await addTask(ALICE, 'Groceries', 'remember the rent receipt');
    await addTask(ALICE, 'Pay rent');
    expect(await titlesFor('rent')).toEqual(['Pay rent', 'Groceries']);
  });

  it('only returns the user’s live entities of the type', async () => {
    const id = await addTask(ALICE, 'Pay rent');
    await addTask(BOB, 'Pay rent bob');
    await alice().insert(entities, { type: 'note', title: 'rent note' });
    expect(await titlesFor('rent')).toEqual(['Pay rent']);
    expect(await titlesFor('rent', bob())).toEqual(['Pay rent bob']);
    await alice().softDelete(entities, eq(entities.id, id));
    expect(await titlesFor('rent')).toEqual([]);
  });

  it('respects the limit', async () => {
    for (const n of [1, 2, 3]) await addTask(ALICE, `rent ${String(n)}`);
    expect(await matchEntities(alice(), { text: 'rent', type: 'task', limit: 2 })).toHaveLength(2);
  });

  it('uses entities_search_vector_idx for a search (no timing, only the plan)', async () => {
    const rows = Array.from({ length: 3000 }, (_, n) => ({
      user_id: ALICE,
      type: 'task',
      title: `filler ${String(n)} word${String(n)}`,
    }));
    await t.db.execute(sql`
      insert into entities (user_id, type, title, search_vector)
      select r.user_id::uuid, r.type::entity_type, r.title, to_tsvector('simple', r.title)
      from json_to_recordset(${JSON.stringify(rows)}::json)
        as r(user_id text, type text, title text)`);
    await t.db.execute(sql`analyze entities`);
    const plan = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return await tx.execute(
        sql`explain select id from entities where search_vector @@ ${prefixQuery('word12')}`,
      );
    });
    const text = plan.rows.map((row) => Object.values(row as object).join(' ')).join('\n');
    expect(text).toContain('entities_search_vector_idx');
  });
});

describe('snippets', () => {
  it('returns an excerpt only where the description matches and the title does not', async () => {
    const inTitle = await addTask(ALICE, 'Pay rent', 'monthly rent for the flat');
    const inText = await addTask(ALICE, 'Groceries', 'remember the rent receipt for the landlord');
    const none = await addTask(ALICE, 'Groceries two', null);
    const result = await snippets(alice(), {
      table: tasks,
      titleColumn: tasks.title,
      textColumn: tasks.description,
      ids: [inTitle, inText, none],
      text: 'rent',
    });
    expect([...result.keys()]).toEqual([inText]);
    expect(result.get(inText)).toContain('rent receipt');
    expect(result.get(inText)).not.toMatch(/[<>]/);
  });

  it('never returns another user’s rows and skips an empty id list', async () => {
    const other = await addTask(BOB, 'Groceries', 'the rent receipt');
    const args = { table: tasks, titleColumn: tasks.title, textColumn: tasks.description };
    expect((await snippets(alice(), { ...args, ids: [other], text: 'rent' })).size).toBe(0);
    expect((await snippets(alice(), { ...args, ids: [], text: 'rent' })).size).toBe(0);
  });
});

describe('startsWith', () => {
  it('matches the start of a value, ignoring case, and escapes % _ and backslash', async () => {
    await addTask(ALICE, 'Home');
    await addTask(ALICE, '100% done');
    await addTask(ALICE, 'a_b');
    await addTask(ALICE, 'axb');
    const starts = async (prefix: string) =>
      (
        await alice().selectFields(
          entities,
          { title: entities.title },
          { where: startsWith(entities.title, prefix), orderBy: entities.title },
        )
      ).map((r) => r.title);
    expect(await starts('ho')).toEqual(['Home']);
    expect(await starts('100%')).toEqual(['100% done']);
    expect(await starts('%')).toEqual([]);
    expect(await starts('a_')).toEqual(['a_b']);
    expect(await starts('\\')).toEqual([]);
  });
});
