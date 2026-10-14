import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { SearchResult } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const makeTask = async (ctx: ActionContext, input: Record<string, unknown>) =>
  (await registry.run(ctx, 'tasks.create', input)).data as { id: string };
const makeTag = async (ctx: ActionContext, name: string) =>
  (await registry.run(ctx, 'tags.create', { name })).data as { id: string };
const search = async (ctx: ActionContext, input: Record<string, unknown>) =>
  (await registry.run(ctx, 'search.global', input)).data as SearchResult;
const titles = (result: SearchResult, type: 'task' | 'tag') =>
  result.groups.find((group) => group.type === type)?.items.map((item) => item.title) ?? [];

describe('search.global: tasks', () => {
  it('finds tasks by the start of every word in the title and the description', async () => {
    await makeTask(alice(), { title: 'Pay rent to Mr. Nair' });
    await makeTask(alice(), { title: 'Groceries', description: 'remember the rent receipt' });
    await makeTask(alice(), { title: 'Call mom' });
    const result = await search(alice(), { q: 'rent' });
    expect(titles(result, 'task')).toEqual(['Pay rent to Mr. Nair', 'Groceries']);
    expect(titles(await search(alice(), { q: 'pay re' }), 'task')).toEqual([
      'Pay rent to Mr. Nair',
    ]);
  });

  it('returns the task fields the palette needs', async () => {
    const due = '2026-10-15T18:30:00.000Z';
    const task = await makeTask(alice(), { title: 'Pay rent', dueAt: due, dueAllDay: true });
    const result = await search(alice(), { q: 'rent' });
    expect(result).toEqual({
      q: 'rent',
      groups: [
        {
          type: 'task',
          items: [
            {
              type: 'task',
              id: task.id,
              title: 'Pay rent',
              snippet: null,
              status: 'todo',
              dueAt: due,
              dueAllDay: true,
              archived: false,
              parentTaskId: null,
            },
          ],
        },
      ],
    });
  });

  it('gives a snippet only when the match is in the description, not the title', async () => {
    await makeTask(alice(), { title: 'Pay rent', description: 'monthly rent for the flat' });
    await makeTask(alice(), { title: 'Groceries', description: 'remember the rent receipt' });
    const items = (await search(alice(), { q: 'rent' })).groups[0]?.items ?? [];
    const byTitle = Object.fromEntries(items.map((item) => [item.title, item.snippet]));
    expect(byTitle['Pay rent']).toBeNull();
    expect(byTitle.Groceries).toContain('rent receipt');
  });

  it('never shows another user’s tasks', async () => {
    await makeTask(bob(), { title: 'Bob rent' });
    expect((await search(alice(), { q: 'rent' })).groups).toEqual([]);
    expect(titles(await search(bob(), { q: 'rent' }), 'task')).toEqual(['Bob rent']);
  });

  it('leaves out deleted tasks, and brings them back after the undo', async () => {
    const task = await makeTask(alice(), { title: 'Pay rent' });
    const deleted = await registry.run(alice(), 'tasks.delete', { id: task.id });
    expect((await search(alice(), { q: 'rent' })).groups).toEqual([]);
    const undo = deleted.undo as { action: string; input: Record<string, unknown> };
    await registry.run(alice(), undo.action, undo.input);
    expect(titles(await search(alice(), { q: 'rent' }), 'task')).toEqual(['Pay rent']);
  });

  it('shows archived tasks, marked archived', async () => {
    const task = await makeTask(alice(), { title: 'Pay rent' });
    await registry.run(alice(), 'tasks.archive', { id: task.id });
    const items = (await search(alice(), { q: 'rent' })).groups[0]?.items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ archived: true });
  });

  it('ranks done and archived tasks at half weight', async () => {
    const done = await makeTask(alice(), { title: 'rent' });
    await registry.run(alice(), 'tasks.complete', { id: done.id });
    const archived = await makeTask(alice(), { title: 'rent' });
    await registry.run(alice(), 'tasks.archive', { id: archived.id });
    const open = await makeTask(alice(), { title: 'rent' });
    // The open one was made last, but the order must not depend on that alone: a weak open
    // match (description only) stays below a done title match, an equal open match beats it.
    const weak = await makeTask(alice(), { title: 'Groceries', description: 'rent' });
    const ids = ((await search(alice(), { q: 'rent' })).groups[0]?.items ?? []).map((i) => i.id);
    expect(ids[0]).toBe(open.id);
    expect(ids.indexOf(weak.id)).toBeGreaterThan(ids.indexOf(done.id));
    expect(ids.indexOf(weak.id)).toBeGreaterThan(ids.indexOf(archived.id));
    expect(ids).toHaveLength(4);
  });

  it('ranks an open task above an equal done task even when the done one is newer', async () => {
    const open = await makeTask(alice(), { title: 'rent' });
    const done = await makeTask(alice(), { title: 'rent' });
    await registry.run(alice(), 'tasks.complete', { id: done.id });
    const ids = ((await search(alice(), { q: 'rent' })).groups[0]?.items ?? []).map((i) => i.id);
    expect(ids).toEqual([open.id, done.id]);
  });

  it('finds subtasks, and drops them when their parent is deleted', async () => {
    const parent = await makeTask(alice(), { title: 'Move house' });
    await makeTask(alice(), { title: 'Pack boxes', parentTaskId: parent.id });
    const found = (await search(alice(), { q: 'pack' })).groups[0]?.items ?? [];
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ title: 'Pack boxes', parentTaskId: parent.id });
    await registry.run(alice(), 'tasks.delete', { id: parent.id });
    expect((await search(alice(), { q: 'pack' })).groups).toEqual([]);
  });

  it('keeps at most `limit` tasks, best first', async () => {
    for (const n of [1, 2, 3, 4]) await makeTask(alice(), { title: `rent ${String(n)}` });
    expect(titles(await search(alice(), { q: 'rent', limit: 2 }), 'task')).toHaveLength(2);
    expect(titles(await search(alice(), { q: 'rent' }), 'task')).toHaveLength(4);
  });

  it('keeps an older open match first when many newer done tasks match as well', async () => {
    const open = await makeTask(alice(), { title: 'rent' });
    for (let n = 0; n < 25; n += 1) {
      const done = await makeTask(alice(), { title: 'rent' });
      await registry.run(alice(), 'tasks.complete', { id: done.id });
    }
    const items = (await search(alice(), { q: 'rent', limit: 5 })).groups[0]?.items ?? [];
    expect(items).toHaveLength(5);
    expect(items[0]?.id).toBe(open.id);
  });

  it('is not shortened by many orphaned subtasks', async () => {
    for (const n of [1, 2, 3]) await makeTask(alice(), { title: `rent ${String(n)}` });
    const parent = await makeTask(alice(), { title: 'Move house' });
    for (let n = 0; n < 120; n += 1) {
      await makeTask(alice(), { title: 'rent', parentTaskId: parent.id });
    }
    // Only the parent row is marked deleted, so the subtasks stay matchable orphans.
    await t.db.execute(sql`update tasks set deleted_at = now() where id = ${parent.id}`);
    const titlesFound = titles(await search(alice(), { q: 'rent', limit: 3 }), 'task');
    expect(titlesFound).toHaveLength(3);
    expect(titlesFound.every((title) => title.startsWith('rent '))).toBe(true);
  });

  it('survives punctuation, a NUL byte and Malayalam', async () => {
    await makeTask(alice(), { title: 'വാടക കൊടുക്കണം' });
    await makeTask(alice(), { title: 'Pay rent' });
    expect((await search(alice(), { q: '& ( :* !' })).groups).toEqual([]);
    expect(titles(await search(alice(), { q: 'pay\u0000re' }), 'task')).toEqual(['Pay rent']);
    expect(titles(await search(alice(), { q: 'pay\u0000 re' }), 'task')).toEqual(['Pay rent']);
    expect(titles(await search(alice(), { q: 'വാ' }), 'task')).toEqual(['വാടക കൊടുക്കണം']);
  });
});

describe('search.global: tags', () => {
  it('finds a tag by the start of its name, ignoring case and a leading #', async () => {
    await makeTag(alice(), 'Home');
    await makeTag(alice(), 'Work');
    expect(titles(await search(alice(), { q: 'ho' }), 'tag')).toEqual(['Home']);
    expect(titles(await search(alice(), { q: '#HOME' }), 'tag')).toEqual(['Home']);
  });

  it('returns the tag color and no snippet', async () => {
    const tag = await makeTag(alice(), 'Home');
    const item = (await search(alice(), { q: 'home' })).groups[0]?.items[0];
    expect(item).toMatchObject({ type: 'tag', id: tag.id, title: 'Home', snippet: null });
    expect(item).toHaveProperty('color');
  });

  it('puts the exact name first, then shorter names', async () => {
    await makeTag(alice(), 'Homework');
    await makeTag(alice(), 'Home-office');
    await makeTag(alice(), 'Home');
    await makeTag(alice(), 'Homes');
    expect(titles(await search(alice(), { q: 'home' }), 'tag')).toEqual([
      'Home',
      'Homes',
      'Homework',
      'Home-office',
    ]);
  });

  it('searches tags only for a single word', async () => {
    await makeTag(alice(), 'Home');
    expect(titles(await search(alice(), { q: 'home' }), 'tag')).toEqual(['Home']);
    expect(titles(await search(alice(), { q: 'home off' }), 'tag')).toEqual([]);
  });

  it('never shows another user’s tags', async () => {
    await makeTag(bob(), 'Home');
    expect((await search(alice(), { q: 'home' })).groups).toEqual([]);
  });

  it('respects the limit', async () => {
    for (const name of ['Ha1', 'Ha2', 'Ha3']) await makeTag(alice(), name);
    expect(titles(await search(alice(), { q: 'ha', limit: 2 }), 'tag')).toHaveLength(2);
  });
});

describe('search.global: groups, types and input', () => {
  it('lists only non-empty groups, tasks before tags', async () => {
    await makeTag(alice(), 'rentals');
    await makeTask(alice(), { title: 'Pay rent' });
    const result = await search(alice(), { q: 'rent' });
    expect(result.groups.map((group) => group.type)).toEqual(['task', 'tag']);
    const onlyTags = await search(alice(), { q: 'rental' });
    expect(onlyTags.groups.map((group) => group.type)).toEqual(['tag']);
  });

  it('searches only the asked types', async () => {
    await makeTag(alice(), 'rentals');
    await makeTask(alice(), { title: 'Pay rent' });
    expect(
      (await search(alice(), { q: 'rent', types: ['tag'] })).groups.map((g) => g.type),
    ).toEqual(['tag']);
    expect(
      (await search(alice(), { q: 'rent', types: ['task'] })).groups.map((g) => g.type),
    ).toEqual(['task']);
  });

  it('answers with no groups for text without words', async () => {
    await makeTask(alice(), { title: 'Pay rent' });
    expect(await search(alice(), { q: '  !! ' })).toEqual({ q: '!!', groups: [] });
  });

  it('rejects bad input with a ZodError', async () => {
    const bad = [
      {},
      { q: '' },
      { q: '   ' },
      { q: 'a'.repeat(101) },
      { q: 'rent', types: ['note'] },
      { q: 'rent', types: [] },
      { q: 'rent', limit: 0 },
      { q: 'rent', limit: 21 },
    ];
    for (const input of bad) {
      await expect(registry.run(alice(), 'search.global', input)).rejects.toBeInstanceOf(ZodError);
    }
  });

  it('is a read action: it needs no confirmation and returns no undo', async () => {
    const result = await registry.run({ ...alice(), confirmed: false }, 'search.global', {
      q: 'rent',
    });
    expect(result.undo ?? null).toBeNull();
  });
});
