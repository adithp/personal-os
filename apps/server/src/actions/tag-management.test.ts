import { entities, entityTags, taskFavorites, tags } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { MAX_FAVORITES, type FavoriteView } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';
import { chunk, relinkTasks } from './tag-management';

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
    sql`truncate table entity_tags, tags, links, tasks, entities, task_favorites, auth.users cascade`,
  );
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

interface Item {
  id: string;
  name: string;
}
type Undo = { action: string; input: Record<string, unknown> } | null | undefined;

const makeTag = async (ctx: ActionContext, name: string) =>
  (await registry.run(ctx, 'tags.create', { name })).data as Item;
const makeTask = async (ctx: ActionContext, title: string, tagIds: string[] = []) =>
  (await registry.run(ctx, 'tasks.create', { title, tagIds })).data as Item;
const makeFavorite = async (ctx: ActionContext, name: string, view: FavoriteView) => {
  const [row] = await ctx.scope.insert(taskFavorites, {
    name,
    color: '#F7D96B',
    icon: 'hash',
    view,
  });
  if (!row) throw new Error('no favorite');
  return row.id;
};
/** A note (not a task) that has the tag; its id. */
const addNoteLink = async (tagId: string) => {
  const [note] = await alice().scope.insert(entities, { type: 'note', title: 'a note' });
  if (!note) throw new Error('no note');
  await alice().scope.insert(entityTags, { entityId: note.id, tagId });
  return note.id;
};
const favorite = async (id: string) => {
  const [row] = await t.db
    .select()
    .from(taskFavorites)
    .where(sql`id = ${id}`);
  return row;
};
const linkedTags = async (taskId: string) =>
  (
    await t.db
      .select()
      .from(entityTags)
      .where(sql`entity_id = ${taskId}`)
  )
    .map((link) => link.tagId)
    .sort();
const runUndo = async (ctx: ActionContext, undo: Undo) =>
  await registry.run(ctx, undo?.action ?? '', undo?.input);

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('tags.delete', () => {
  it('soft-deletes the tag, removes its links, and keeps the tasks', async () => {
    const tag = await makeTag(alice(), 'work');
    const keep = await makeTag(alice(), 'keep');
    const a = await makeTask(alice(), 'a', [tag.id, keep.id]);
    const b = await makeTask(alice(), 'b', [tag.id]);
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    expect(result.data).toMatchObject({ id: tag.id, name: 'work' });
    expect(await linkedTags(a.id)).toEqual([keep.id]);
    expect(await linkedTags(b.id)).toEqual([]);
    const tasks = (await registry.run(alice(), 'tasks.list', {})).data as Item[];
    expect(tasks).toHaveLength(2);
    const live = (await registry.run(alice(), 'tags.list', {})).data as Item[];
    expect(live.map((item) => item.name)).toEqual(['keep']);
    const [row] = await t.db
      .select()
      .from(tags)
      .where(sql`id = ${tag.id}`);
    expect(row?.deletedAt).not.toBeNull();
  });

  it('updates favorites and soft-deletes the ones left empty', async () => {
    const tag = await makeTag(alice(), 'work');
    const other = await makeTag(alice(), 'other');
    const only = await makeFavorite(alice(), 'only', { tagIds: [tag.id] });
    const mixed = await makeFavorite(alice(), 'mixed', {
      tagIds: [tag.id, other.id],
      due: 'today',
    });
    const unrelated = await makeFavorite(alice(), 'unrelated', { tagIds: [other.id] });
    await registry.run(alice(), 'tags.delete', { id: tag.id });
    expect((await favorite(only))?.deletedAt).not.toBeNull();
    expect((await favorite(mixed))?.view).toEqual({ tagIds: [other.id], due: 'today' });
    expect((await favorite(mixed))?.deletedAt).toBeNull();
    expect((await favorite(unrelated))?.view).toEqual({ tagIds: [other.id] });
  });

  it('returns tags.restore with the task ids and the views before', async () => {
    const tag = await makeTag(alice(), 'work');
    const task = await makeTask(alice(), 'a', [tag.id]);
    const fav = await makeFavorite(alice(), 'only', { tagIds: [tag.id] });
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    expect(result.undo).toEqual({
      action: 'tags.restore',
      input: {
        id: tag.id,
        taskIds: [task.id],
        favorites: [{ id: fav, view: { tagIds: [tag.id] }, removed: true }],
      },
    });
  });

  it('puts links and favorites back through the undo', async () => {
    const tag = await makeTag(alice(), 'work');
    const other = await makeTag(alice(), 'other');
    const task = await makeTask(alice(), 'a', [tag.id]);
    const only = await makeFavorite(alice(), 'only', { tagIds: [tag.id] });
    const mixed = await makeFavorite(alice(), 'mixed', { tagIds: [tag.id, other.id] });
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    const restored = await runUndo(alice(), result.undo);
    expect(restored.data).toMatchObject({ id: tag.id, name: 'work' });
    expect(restored.undo).toEqual({ action: 'tags.delete', input: { id: tag.id } });
    expect(await linkedTags(task.id)).toEqual([tag.id]);
    expect((await favorite(only))?.deletedAt).toBeNull();
    expect((await favorite(only))?.view).toEqual({ tagIds: [tag.id] });
    expect((await favorite(mixed))?.view).toEqual({ tagIds: [tag.id, other.id] });
  });

  it('puts the tag back on tasks that are in the trash when the delete is undone', async () => {
    const tag = await makeTag(alice(), 'work');
    const task = await makeTask(alice(), 'a', [tag.id]);
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    await registry.run(alice(), 'tasks.delete', { id: task.id });
    await runUndo(alice(), result.undo);
    expect(await linkedTags(task.id)).toEqual([tag.id]);
  });

  it('removes the links of tasks in the trash but never the links of other entity types', async () => {
    const tag = await makeTag(alice(), 'work');
    const task = await makeTask(alice(), 'a', [tag.id]);
    await registry.run(alice(), 'tasks.delete', { id: task.id });
    const note = await addNoteLink(tag.id);
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    expect(await linkedTags(task.id)).toEqual([]);
    expect(await linkedTags(note)).toEqual([tag.id]);
    expect(result.undo?.input).toMatchObject({ taskIds: [task.id] });
  });

  it('is a 404 for an unknown, deleted, or another user’s tag, and changes nothing', async () => {
    const bobs = await makeTag(bob(), 'bobs');
    const task = await makeTask(bob(), 'b', [bobs.id]);
    const gone = await makeTag(alice(), 'gone');
    await registry.run(alice(), 'tags.delete', { id: gone.id });
    for (const id of [MISSING, bobs.id, gone.id]) {
      const error = await failure(registry.run(alice(), 'tags.delete', { id }));
      expect((error as HttpError).statusCode).toBe(404);
    }
    expect(await linkedTags(task.id)).toEqual([bobs.id]);
  });

  it('refuses a bad id', async () => {
    expect(await failure(registry.run(alice(), 'tags.delete', { id: 'x' }))).toBeInstanceOf(
      ZodError,
    );
  });

  it('never touches another user’s favorites', async () => {
    const tag = await makeTag(alice(), 'work');
    const theirs = await makeFavorite(bob(), 'theirs', { tagIds: [tag.id] });
    await registry.run(alice(), 'tags.delete', { id: tag.id });
    expect((await favorite(theirs))?.deletedAt).toBeNull();
    expect((await favorite(theirs))?.view).toEqual({ tagIds: [tag.id] });
  });
});

describe('tags.restore', () => {
  it('answers 409 when a live tag with the same name exists again, and changes nothing', async () => {
    const tag = await makeTag(alice(), 'Home');
    const task = await makeTask(alice(), 'a', [tag.id]);
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    await makeTag(alice(), 'home');
    const error = await failure(runUndo(alice(), result.undo));
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'conflict',
      message: "A tag named 'Home' exists again. Rename it first.",
    });
    expect(await linkedTags(task.id)).toEqual([]);
  });

  it('ignores tasks of another user and missing tasks and favorites, and relinks trashed tasks', async () => {
    const tag = await makeTag(alice(), 'work');
    const mine = await makeTask(alice(), 'mine', [tag.id]);
    const theirs = await makeTask(bob(), 'theirs');
    const trashed = await makeTask(alice(), 'trashed', [tag.id]);
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    await registry.run(alice(), 'tasks.delete', { id: trashed.id });
    const input = result.undo?.input as { taskIds: string[] };
    await registry.run(alice(), 'tags.restore', {
      ...input,
      taskIds: [...input.taskIds, theirs.id, MISSING],
      favorites: [{ id: MISSING, view: { due: 'today' }, removed: true }],
    });
    expect(await linkedTags(mine.id)).toEqual([tag.id]);
    expect(await linkedTags(theirs.id)).toEqual([]);
    expect(await linkedTags(trashed.id)).toEqual([tag.id]);
  });

  it('accepts the same task id twice without a conflict', async () => {
    const tag = await makeTag(alice(), 'work');
    const task = await makeTask(alice(), 'a');
    await registry.run(alice(), 'tags.restore', {
      id: tag.id,
      taskIds: [task.id, task.id],
      favorites: [],
    });
    expect(await linkedTags(task.id)).toEqual([tag.id]);
  });

  it('does not push live favorites above 12 and leaves the rest deleted', async () => {
    const tag = await makeTag(alice(), 'work');
    const views: FavoriteView[] = [{ sort: 'due' }, { sort: 'title' }];
    const [first, second] = [
      await makeFavorite(alice(), 'first', views[0] ?? {}),
      await makeFavorite(alice(), 'second', views[1] ?? {}),
    ];
    await alice().scope.softDelete(taskFavorites, sql`true`);
    for (let index = 0; index < MAX_FAVORITES - 1; index++) {
      await makeFavorite(alice(), `f${String(index)}`, { due: 'today' });
    }
    await registry.run(alice(), 'tags.restore', {
      id: tag.id,
      taskIds: [],
      favorites: [
        { id: first, view: views[0], removed: true },
        { id: second, view: views[1], removed: true },
      ],
    });
    const rows = await t.db.select().from(taskFavorites);
    expect(rows.filter((row) => row.deletedAt === null)).toHaveLength(MAX_FAVORITES);
    expect((await favorite(first))?.deletedAt).toBeNull();
    expect((await favorite(second))?.deletedAt).not.toBeNull();
  });

  it('drops tag ids that are not live any more and skips a view with nothing left', async () => {
    const tag = await makeTag(alice(), 'work');
    const other = await makeTag(alice(), 'other');
    const mixed = await makeFavorite(alice(), 'mixed', { tagIds: [tag.id, other.id] });
    const only = await makeFavorite(alice(), 'only', { tagIds: [other.id] });
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    await registry.run(alice(), 'tags.delete', { id: other.id });
    const undoInput = result.undo?.input as { favorites: unknown[] };
    await registry.run(alice(), 'tags.restore', {
      ...undoInput,
      favorites: [
        ...undoInput.favorites,
        { id: only, view: { tagIds: [other.id] }, removed: true },
      ],
    });
    expect((await favorite(mixed))?.view).toEqual({ tagIds: [tag.id] });
    expect((await favorite(only))?.deletedAt).not.toBeNull();
  });

  it('does not un-delete a favorite when a live one has the same view', async () => {
    const tag = await makeTag(alice(), 'work');
    const first = await makeFavorite(alice(), 'first', { tagIds: [tag.id] });
    const result = await registry.run(alice(), 'tags.delete', { id: tag.id });
    const same = await makeFavorite(alice(), 'same', { tagIds: [tag.id] });
    await runUndo(alice(), result.undo);
    expect((await favorite(first))?.deletedAt).not.toBeNull();
    expect((await favorite(same))?.deletedAt).toBeNull();
  });

  it('does not duplicate a link that exists already', async () => {
    const tag = await makeTag(alice(), 'work');
    const task = await makeTask(alice(), 'a', [tag.id]);
    await registry.run(alice(), 'tags.restore', { id: tag.id, taskIds: [task.id], favorites: [] });
    expect(await linkedTags(task.id)).toEqual([tag.id]);
  });

  it('is a 404 for an unknown or another user’s tag', async () => {
    const bobs = await makeTag(bob(), 'bobs');
    for (const id of [MISSING, bobs.id]) {
      const error = await failure(
        registry.run(alice(), 'tags.restore', { id, taskIds: [], favorites: [] }),
      );
      expect((error as HttpError).statusCode).toBe(404);
    }
  });

  it('refuses more than 5000 task ids and a favorite with an empty view', async () => {
    const tag = await makeTag(alice(), 'work');
    const many = Array.from({ length: 5001 }, () => MISSING);
    expect(
      await failure(
        registry.run(alice(), 'tags.restore', { id: tag.id, taskIds: many, favorites: [] }),
      ),
    ).toBeInstanceOf(ZodError);
    expect(
      await failure(
        registry.run(alice(), 'tags.restore', {
          id: tag.id,
          taskIds: [],
          favorites: [{ id: MISSING, view: {}, removed: false }],
        }),
      ),
    ).toBeInstanceOf(ZodError);
  });
});

describe('tags.merge', () => {
  it('moves tasks to the target, keeps one link for a task with both, and deletes the source', async () => {
    const source = await makeTag(alice(), 'house');
    const target = await makeTag(alice(), 'home');
    const onlySource = await makeTask(alice(), 'a', [source.id]);
    const both = await makeTask(alice(), 'b', [source.id, target.id]);
    const onlyTarget = await makeTask(alice(), 'c', [target.id]);
    const result = await registry.run(alice(), 'tags.merge', {
      sourceId: source.id,
      targetId: target.id,
    });
    expect(result.data).toMatchObject({ id: target.id, name: 'home' });
    expect(await linkedTags(onlySource.id)).toEqual([target.id]);
    expect(await linkedTags(both.id)).toEqual([target.id]);
    expect(await linkedTags(onlyTarget.id)).toEqual([target.id]);
    const live = (await registry.run(alice(), 'tags.list', {})).data as Item[];
    expect(live.map((item) => item.id)).toEqual([target.id]);
    expect(
      await t.db
        .select()
        .from(entityTags)
        .where(sql`tag_id = ${source.id}`),
    ).toHaveLength(0);
  });

  it('replaces the tag in favorites and removes the changed one that now repeats another view', async () => {
    const source = await makeTag(alice(), 'house');
    const target = await makeTag(alice(), 'home');
    const a = await makeFavorite(alice(), 'a', { tagIds: [source.id, target.id], due: 'today' });
    const b = await makeFavorite(alice(), 'b', { tagIds: [target.id] });
    const c = await makeFavorite(alice(), 'c', { tagIds: [source.id] });
    const result = await registry.run(alice(), 'tags.merge', {
      sourceId: source.id,
      targetId: target.id,
    });
    expect((await favorite(a))?.view).toEqual({ tagIds: [target.id], due: 'today' });
    expect((await favorite(a))?.deletedAt).toBeNull();
    expect((await favorite(b))?.view).toEqual({ tagIds: [target.id] });
    expect((await favorite(b))?.deletedAt).toBeNull();
    expect((await favorite(c))?.deletedAt).not.toBeNull();
    expect(result.undo?.input).toMatchObject({
      favorites: expect.arrayContaining([
        { id: c, view: { tagIds: [source.id] }, removed: true },
      ]) as unknown,
    });
    await runUndo(alice(), result.undo);
    expect((await favorite(c))?.deletedAt).toBeNull();
    expect((await favorite(c))?.view).toEqual({ tagIds: [source.id] });
    expect((await favorite(a))?.view).toEqual({ tagIds: [source.id, target.id], due: 'today' });
  });

  it('puts the tag back on tasks in the trash when the merge is undone', async () => {
    const source = await makeTag(alice(), 'house');
    const target = await makeTag(alice(), 'home');
    const task = await makeTask(alice(), 'a', [source.id]);
    const result = await registry.run(alice(), 'tags.merge', {
      sourceId: source.id,
      targetId: target.id,
    });
    await registry.run(alice(), 'tasks.delete', { id: task.id });
    await runUndo(alice(), result.undo);
    expect(await linkedTags(task.id)).toEqual([source.id, target.id].sort());
  });

  it('leaves the tag links of other entity types alone', async () => {
    const source = await makeTag(alice(), 'house');
    const target = await makeTag(alice(), 'home');
    const note = await addNoteLink(source.id);
    await registry.run(alice(), 'tags.merge', { sourceId: source.id, targetId: target.id });
    expect(await linkedTags(note)).toEqual([source.id]);
  });

  it('moves a tag on many tasks (more than one batch)', async () => {
    const source = await makeTag(alice(), 'house');
    const target = await makeTag(alice(), 'home');
    const count = 2500;
    await t.db.execute(sql`
      insert into entities (id, user_id, type, title)
      select gen_random_uuid(), ${ALICE}::uuid, 'task', 't' || n from generate_series(1, ${count}) n`);
    await t.db.execute(sql`
      insert into tasks (id, user_id, title) select id, user_id, title from entities
      where user_id = ${ALICE}::uuid and type = 'task'`);
    await t.db.execute(sql`
      insert into entity_tags (user_id, entity_id, tag_id)
      select user_id, id, ${source.id}::uuid from tasks where user_id = ${ALICE}::uuid`);
    const result = await registry.run(alice(), 'tags.merge', {
      sourceId: source.id,
      targetId: target.id,
    });
    const moved = await t.db
      .select()
      .from(entityTags)
      .where(sql`tag_id = ${target.id}`);
    expect(moved).toHaveLength(count);
    expect(result.undo?.action).toBe('tags.unmerge');
  }, 30_000);

  it('undo through tags.unmerge brings back the source tag, its links, and the views', async () => {
    const source = await makeTag(alice(), 'house');
    const target = await makeTag(alice(), 'home');
    const onlySource = await makeTask(alice(), 'a', [source.id]);
    const both = await makeTask(alice(), 'b', [source.id, target.id]);
    const fav = await makeFavorite(alice(), 'f', { tagIds: [source.id], sort: 'due' });
    const result = await registry.run(alice(), 'tags.merge', {
      sourceId: source.id,
      targetId: target.id,
    });
    expect(result.undo?.action).toBe('tags.unmerge');
    const undone = await runUndo(alice(), result.undo);
    expect(undone.data).toMatchObject({ id: source.id, name: 'house' });
    expect(undone.undo).toBeNull();
    expect(await linkedTags(onlySource.id)).toEqual([source.id, target.id].sort());
    expect(await linkedTags(both.id)).toEqual([source.id, target.id].sort());
    expect((await favorite(fav))?.view).toEqual({ tagIds: [source.id], sort: 'due' });
    const live = (await registry.run(alice(), 'tags.list', {})).data as Item[];
    expect(live.map((item) => item.name).sort()).toEqual(['home', 'house']);
  });

  it('answers 409 on unmerge when the source name exists again', async () => {
    const source = await makeTag(alice(), 'house');
    const target = await makeTag(alice(), 'home');
    const result = await registry.run(alice(), 'tags.merge', {
      sourceId: source.id,
      targetId: target.id,
    });
    await makeTag(alice(), 'HOUSE');
    const error = await failure(runUndo(alice(), result.undo));
    expect(error).toMatchObject({ statusCode: 409, code: 'conflict' });
  });

  it('is a 404 for an unknown, deleted, or another user’s tag, and changes nothing', async () => {
    const mine = await makeTag(alice(), 'mine');
    const task = await makeTask(alice(), 'a', [mine.id]);
    const bobs = await makeTag(bob(), 'bobs');
    const gone = await makeTag(alice(), 'gone');
    await registry.run(alice(), 'tags.delete', { id: gone.id });
    const pairs = [
      [mine.id, MISSING],
      [MISSING, mine.id],
      [mine.id, bobs.id],
      [bobs.id, mine.id],
      [mine.id, gone.id],
      [gone.id, mine.id],
    ] as const;
    for (const [sourceId, targetId] of pairs) {
      const error = await failure(registry.run(alice(), 'tags.merge', { sourceId, targetId }));
      expect((error as HttpError).statusCode).toBe(404);
    }
    expect(await linkedTags(task.id)).toEqual([mine.id]);
    expect((await registry.run(bob(), 'tags.list', {})).data).toHaveLength(1);
  });

  it('refuses the same tag twice and bad ids', async () => {
    const tag = await makeTag(alice(), 'x');
    for (const input of [
      { sourceId: tag.id, targetId: tag.id },
      { sourceId: 'x', targetId: tag.id },
      { sourceId: tag.id },
    ]) {
      expect(await failure(registry.run(alice(), 'tags.merge', input))).toBeInstanceOf(ZodError);
    }
  });
});

describe('batches', () => {
  it('chunk splits a list into pieces of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('relinkTasks links every task across batches, skipping missing ones', async () => {
    const tag = await makeTag(alice(), 'work');
    const tasks = [
      await makeTask(alice(), 'a'),
      await makeTask(alice(), 'b'),
      await makeTask(alice(), 'c'),
      await makeTask(alice(), 'd'),
      await makeTask(alice(), 'e'),
    ];
    const ids = [...tasks.map((task) => task.id), MISSING];
    await alice().scope.transaction((tx) => relinkTasks(tx, tag.id, ids, 2));
    for (const task of tasks) expect(await linkedTags(task.id)).toEqual([tag.id]);
    await alice().scope.transaction((tx) => relinkTasks(tx, tag.id, ids, 2));
    expect(await t.db.select().from(entityTags)).toHaveLength(5);
  });
});

describe('tag management permissions', () => {
  it('delete and merge are destructive, restore and unmerge are write', () => {
    expect(registry.permissionOf('tags.delete')).toBe('destructive');
    expect(registry.permissionOf('tags.merge')).toBe('destructive');
    expect(registry.permissionOf('tags.restore')).toBe('write');
    expect(registry.permissionOf('tags.unmerge')).toBe('write');
  });

  it('the AI cannot delete or merge without confirmation, and nothing changes', async () => {
    const one = await makeTag(alice(), 'one');
    const two = await makeTag(alice(), 'two');
    const ai = context(ALICE, { source: 'ai', confirmed: false });
    expect(await failure(registry.run(ai, 'tags.delete', { id: one.id }))).toBeDefined();
    expect(
      await failure(registry.run(ai, 'tags.merge', { sourceId: one.id, targetId: two.id })),
    ).toBeDefined();
    expect(((await registry.run(alice(), 'tags.list', {})).data as Item[]).length).toBe(2);
  });
});
