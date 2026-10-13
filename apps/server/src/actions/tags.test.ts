import { entities, taskFavorites, tags } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { TAG_PALETTE } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

let t: TestDb;
const registry = createRegistry();

const context = (userId: string, overrides: Partial<ActionContext> = {}): ActionContext => ({
  scope: createUserScope(t.db, userId),
  source: 'ui',
  confirmed: true,
  ...overrides,
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

interface TagItem {
  id: string;
  name: string;
  color: string;
  created?: boolean;
}

const createTag = async (ctx: ActionContext, input: Record<string, unknown>) =>
  await registry.run(ctx, 'tags.create', input);
const listTags = async (ctx: ActionContext) =>
  (await registry.run(ctx, 'tags.list', {})).data as TagItem[];

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('tags.create', () => {
  it('creates a tag with the next palette color, with no undo and no entity row', async () => {
    const first = await createTag(alice(), { name: 'work' });
    const second = await createTag(alice(), { name: 'home' });
    expect(first.data).toMatchObject({ name: 'work', color: TAG_PALETTE[0], created: true });
    expect((second.data as TagItem).color).toBe(TAG_PALETTE[1]);
    expect(first.undo).toBeNull();
    expect(await t.db.select().from(entities)).toHaveLength(0);
  });

  it('uses the color it is given', async () => {
    const result = await createTag(alice(), { name: 'x', color: '#112233' });
    expect(result.data).toMatchObject({ color: '#112233' });
  });

  it('returns the existing tag for the same name ignoring case', async () => {
    const first = (await createTag(alice(), { name: 'Work' })).data as TagItem;
    const again = await createTag(alice(), { name: 'wORK', color: '#112233' });
    expect(again.data).toMatchObject({ id: first.id, name: 'Work', created: false });
    expect(again.undo).toBeNull();
    expect(await listTags(alice())).toHaveLength(1);
  });

  it('lets two users have the same tag name', async () => {
    await createTag(alice(), { name: 'work' });
    const result = await createTag(bob(), { name: 'work' });
    expect((result.data as TagItem).created).toBe(true);
    expect(await listTags(bob())).toHaveLength(1);
  });

  it('allows a name again after the old tag was deleted', async () => {
    await createTag(alice(), { name: 'work' });
    await t.db.execute(sql`update tags set deleted_at = now()`);
    const result = await createTag(alice(), { name: 'work' });
    expect((result.data as TagItem).created).toBe(true);
    expect(await listTags(alice())).toHaveLength(1);
  });

  it.each([
    ['no name', {}],
    ['an empty name', { name: '  ' }],
    ['a name with a space', { name: 'a b' }],
    ['a name with #', { name: '#a' }],
    ['a long name', { name: 'x'.repeat(41) }],
    ['a bad color', { name: 'a', color: 'red' }],
  ])('refuses %s', async (_label, input) => {
    expect(await failure(createTag(alice(), input))).toBeInstanceOf(ZodError);
    expect(await t.db.select().from(tags)).toHaveLength(0);
  });
});

describe('tags.list', () => {
  it('lists the user’s live tags, oldest first, and never another user’s', async () => {
    await createTag(alice(), { name: 'b' });
    await createTag(alice(), { name: 'a' });
    await createTag(bob(), { name: 'bobs' });
    const gone = (await createTag(alice(), { name: 'gone' })).data as TagItem;
    await t.db.execute(sql`update tags set deleted_at = now() where id = ${gone.id}`);
    expect((await listTags(alice())).map((tag) => tag.name)).toEqual(['b', 'a']);
    expect((await listTags(bob())).map((tag) => tag.name)).toEqual(['bobs']);
  });
});

describe('tags.list counts', () => {
  const task = async (ctx: ActionContext, title: string, tagIds: string[], parent?: string) =>
    (await registry.run(ctx, 'tasks.create', { title, tagIds, parentTaskId: parent })).data as {
      id: string;
    };
  const counts = async (ctx: ActionContext) =>
    (await registry.run(ctx, 'tags.list', {})).data as (TagItem & {
      taskCount: number;
      favoriteCount: number;
    })[];

  it('counts live tasks of any status, archived and subtasks too, not deleted ones', async () => {
    const work = (await createTag(alice(), { name: 'work' })).data as TagItem;
    const empty = (await createTag(alice(), { name: 'empty' })).data as TagItem;
    const open = await task(alice(), 'open', [work.id]);
    const done = await task(alice(), 'done', [work.id]);
    const archived = await task(alice(), 'archived', [work.id]);
    const trashed = await task(alice(), 'trashed', [work.id]);
    await task(alice(), 'sub', [work.id], open.id);
    await registry.run(alice(), 'tasks.complete', { id: done.id });
    await registry.run(alice(), 'tasks.archive', { id: archived.id });
    await registry.run(alice(), 'tasks.delete', { id: trashed.id });
    expect(await counts(alice())).toMatchObject([
      { id: work.id, taskCount: 4, favoriteCount: 0 },
      { id: empty.id, taskCount: 0, favoriteCount: 0 },
    ]);
  });

  it('counts live favorites that use the tag, and never another user’s tasks or favorites', async () => {
    const work = (await createTag(alice(), { name: 'work' })).data as TagItem;
    const other = (await createTag(alice(), { name: 'other' })).data as TagItem;
    const row = { color: '#F7D96B', icon: 'hash' };
    await alice().scope.insert(taskFavorites, [
      { ...row, name: 'a', view: { tagIds: [work.id, other.id] } },
      { ...row, name: 'b', view: { tagIds: [work.id] } },
    ]);
    const [gone] = await alice().scope.insert(taskFavorites, {
      ...row,
      name: 'gone',
      view: { tagIds: [work.id] },
    });
    await t.db.execute(sql`update task_favorites set deleted_at = now() where id = ${gone?.id}`);
    await bob().scope.insert(taskFavorites, { ...row, name: 'c', view: { tagIds: [work.id] } });
    await task(bob(), 'theirs', []);
    expect(await counts(alice())).toMatchObject([
      { id: work.id, taskCount: 0, favoriteCount: 2 },
      { id: other.id, favoriteCount: 1 },
    ]);
  });

  it('is not added to the results of create and update', async () => {
    const created = (await createTag(alice(), { name: 'x' })).data;
    expect(created).not.toHaveProperty('taskCount');
    const updated = await registry.run(alice(), 'tags.update', {
      id: (created as TagItem).id,
      name: 'y',
    });
    expect(updated.data).not.toHaveProperty('favoriteCount');
  });
});

describe('tags.update', () => {
  it('renames and recolors, and undo puts both back', async () => {
    const tag = (await createTag(alice(), { name: 'work', color: '#111111' })).data as TagItem;
    const result = await registry.run(alice(), 'tags.update', {
      id: tag.id,
      name: 'job',
      color: '#222222',
    });
    expect(result.data).toMatchObject({ name: 'job', color: '#222222' });
    expect(result.undo).toEqual({
      action: 'tags.update',
      input: { id: tag.id, name: 'work', color: '#111111' },
    });
    await registry.run(alice(), result.undo?.action ?? '', result.undo?.input);
    expect(await listTags(alice())).toMatchObject([{ name: 'work', color: '#111111' }]);
  });

  it('can change only the case of a name', async () => {
    const tag = (await createTag(alice(), { name: 'work' })).data as TagItem;
    const result = await registry.run(alice(), 'tags.update', { id: tag.id, name: 'Work' });
    expect(result.data).toMatchObject({ name: 'Work' });
  });

  it('answers 409 conflict when another live tag has the name, ignoring case', async () => {
    await createTag(alice(), { name: 'Work' });
    const other = (await createTag(alice(), { name: 'home' })).data as TagItem;
    const error = await failure(
      registry.run(alice(), 'tags.update', { id: other.id, name: 'work' }),
    );
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 409, code: 'conflict' });
    expect((await listTags(alice())).map((tag) => tag.name)).toEqual(['Work', 'home']);
  });

  it('changes nothing and offers no undo when the values are the same', async () => {
    const tag = (await createTag(alice(), { name: 'work', color: '#111111' })).data as TagItem;
    const result = await registry.run(alice(), 'tags.update', {
      id: tag.id,
      name: 'work',
      color: '#111111',
    });
    expect(result.undo).toBeNull();
  });

  it('cannot change another user’s tag, a missing tag, or a deleted tag', async () => {
    const bobs = (await createTag(bob(), { name: 'bobs' })).data as TagItem;
    for (const id of [bobs.id, MISSING]) {
      const error = await failure(registry.run(alice(), 'tags.update', { id, name: 'x' }));
      expect((error as HttpError).statusCode).toBe(404);
    }
    expect((await listTags(bob()))[0]?.name).toBe('bobs');
    await t.db.execute(sql`update tags set deleted_at = now()`);
    const error = await failure(registry.run(bob(), 'tags.update', { id: bobs.id, name: 'x' }));
    expect((error as HttpError).statusCode).toBe(404);
  });

  it('refuses an empty change and bad values', async () => {
    const tag = (await createTag(alice(), { name: 'work' })).data as TagItem;
    for (const input of [{ id: tag.id }, { id: tag.id, name: '' }, { id: 'x', name: 'a' }]) {
      expect(await failure(registry.run(alice(), 'tags.update', input))).toBeInstanceOf(ZodError);
    }
  });
});

describe('tag permissions', () => {
  it('has the levels from the docs', () => {
    expect(registry.permissionOf('tags.list')).toBe('read');
    expect(registry.permissionOf('tags.create')).toBe('write');
    expect(registry.permissionOf('tags.update')).toBe('write');
  });

  it('write actions run without confirmation', async () => {
    const ai = context(ALICE, { source: 'ai', confirmed: false });
    const result = await registry.run(ai, 'tags.create', { name: 'by-ai' });
    expect(result.data).toMatchObject({ name: 'by-ai' });
  });
});

describe('two creates of the same name at once', () => {
  it('both succeed and give back the same tag (no 500 from the unique index)', async () => {
    const results = await Promise.allSettled([
      registry.run(alice(), 'tags.create', { name: 'racing' }),
      registry.run(alice(), 'tags.create', { name: 'Racing' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const ids = results.map((r) =>
      r.status === 'fulfilled' ? (r.value.data as { id: string }).id : '',
    );
    expect(ids[0]).toBe(ids[1]);
    const all = (await registry.run(alice(), 'tags.list', {})).data as { id: string }[];
    expect(all).toHaveLength(1);
  });
});
