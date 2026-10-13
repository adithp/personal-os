import { taskFavorites } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import {
  GROUP_KEYS,
  MAX_FAVORITES,
  SORT_KEYS,
  TAG_PALETTE,
  favoriteActions,
  type Favorite,
} from '@personal-os/shared';
import { eq, sql } from 'drizzle-orm';
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
    sql`truncate table task_favorites, entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

interface Undo {
  action: string;
  input: Record<string, unknown>;
}
interface Result<T> {
  data: T;
  undo?: Undo | null;
}

const run = async <T = Favorite>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const create = async (ctx: ActionContext, name: string, view: Record<string, unknown>, more = {}) =>
  await run(ctx, 'favorites.create', { name, view, ...more });
const list = async (ctx: ActionContext) => (await run<Favorite[]>(ctx, 'favorites.list', {})).data;
const names = async (ctx: ActionContext) => (await list(ctx)).map((item) => item.name);
const makeTag = async (ctx: ActionContext, name: string) =>
  (await registry.run(ctx, 'tags.create', { name })).data as { id: string };

/** Creates n favorites with views that all differ (sort x group). */
const fill = async (ctx: ActionContext, count: number) => {
  for (let index = 0; index < count; index++) {
    await create(ctx, `F${String(index)}`, {
      sort: SORT_KEYS[index % SORT_KEYS.length],
      group: GROUP_KEYS[Math.floor(index / SORT_KEYS.length) % GROUP_KEYS.length],
    });
  }
};

const undoOf = (result: Result<unknown>): Undo => {
  if (!result.undo) throw new Error('Expected an undo');
  return result.undo;
};
const undo = (result: Result<unknown>) => run(alice(), undoOf(result).action, undoOf(result).input);
const firstOf = <T>(items: T[]): T => {
  const [item] = items;
  if (item === undefined) throw new Error('Expected an item');
  return item;
};

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}
const status = async (promise: Promise<unknown>) => {
  const error = await failure(promise);
  return error instanceof HttpError ? error.statusCode : error;
};

describe('permission levels', () => {
  it('are read for list and write for the rest', () => {
    expect(favoriteActions.list.permission).toBe('read');
    for (const name of ['create', 'update', 'move', 'delete', 'restore'] as const) {
      expect(favoriteActions[name].permission).toBe('write');
    }
  });
});

describe('favorites.create', () => {
  it('creates a favorite with default color, icon, and position, and an undo that deletes it', async () => {
    const first = await create(alice(), 'Urgent', { priority: [1] });
    const second = await create(alice(), 'Open', { status: ['todo'], due: 'today' });
    expect(first.data).toMatchObject({
      name: 'Urgent',
      color: TAG_PALETTE[0],
      icon: 'flag',
      position: 1024,
      view: { priority: [1] },
    });
    expect(second.data).toMatchObject({ color: TAG_PALETTE[1], icon: 'calendar', position: 2048 });
    expect(first.undo).toEqual({ action: 'favorites.delete', input: { id: first.data.id } });
    expect(new Date(first.data.createdAt).toISOString()).toBe(first.data.createdAt);
  });

  it.each<[Record<string, unknown>, string]>([
    [{ tagIds: 'TAG' }, 'hash'],
    [{ tagIds: 'TAG', priority: [2] }, 'flag'],
    [{ due: 'week', status: ['todo'] }, 'calendar'],
    [{ status: ['done'] }, 'progress'],
    [{ archived: true }, 'archive'],
    [{ sort: 'due' }, 'star'],
    [{ group: 'tag' }, 'star'],
  ])('picks the icon from the view %j -> %s', async (view, icon) => {
    const tag = await makeTag(alice(), 'work');
    const real = { ...view, ...(view.tagIds ? { tagIds: [tag.id] } : {}) };
    expect((await create(alice(), 'V', real)).data.icon).toBe(icon);
  });

  it('keeps a color and icon that are given', async () => {
    const result = await create(
      alice(),
      'X',
      { sort: 'due' },
      { color: TAG_PALETTE[3], icon: 'bolt' },
    );
    expect(result.data).toMatchObject({ color: TAG_PALETTE[3], icon: 'bolt' });
  });

  it('rejects invalid input with a ZodError', async () => {
    expect(await failure(create(alice(), 'X', {}))).toBeInstanceOf(ZodError);
    expect(await failure(create(alice(), '  ', { sort: 'due' }))).toBeInstanceOf(ZodError);
    expect(
      await failure(create(alice(), 'X', { sort: 'due' }, { color: '#123456' })),
    ).toBeInstanceOf(ZodError);
  });

  it('returns the existing favorite for the same view, with sets compared in any order', async () => {
    const first = await create(alice(), 'A', { status: ['todo', 'doing'], due: 'today' });
    const again = await create(alice(), 'B', { due: 'today', status: ['doing', 'todo'] });
    expect(again.data.id).toBe(first.data.id);
    expect(again.undo).toBeNull();
    expect(await names(alice())).toEqual(['A']);
    const other = await create(alice(), 'C', { status: ['todo'], due: 'today' });
    expect(other.data.id).not.toBe(first.data.id);
  });

  it('treats the same tags in another order as the same view', async () => {
    const a = await makeTag(alice(), 'a');
    const b = await makeTag(alice(), 'b');
    const first = await create(alice(), 'T', { tagIds: [a.id, b.id] });
    const again = await create(alice(), 'T2', { tagIds: [b.id, a.id] });
    expect(again.data.id).toBe(first.data.id);
  });

  it('does not treat a deleted favorite as the same view', async () => {
    const first = await create(alice(), 'A', { sort: 'due' });
    await run(alice(), 'favorites.delete', { id: first.data.id });
    const again = await create(alice(), 'A2', { sort: 'due' });
    expect(again.data.id).not.toBe(first.data.id);
  });

  it('refuses unknown, foreign, and deleted tag ids with the same 400', async () => {
    const foreign = await makeTag(bob(), 'bobs');
    const mine = await makeTag(alice(), 'mine');
    await t.db.execute(sql`update tags set deleted_at = now() where id = ${mine.id}`);
    for (const id of [MISSING, foreign.id, mine.id]) {
      const error = await failure(create(alice(), 'X', { tagIds: [id] }));
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({
        statusCode: 400,
        code: 'validation_error',
        message: 'Tag not found',
      });
    }
    expect(await list(alice())).toEqual([]);
  });

  it('allows at most 12 live favorites with a 409 favorites_limit', async () => {
    await fill(alice(), MAX_FAVORITES);
    expect(await list(alice())).toHaveLength(MAX_FAVORITES);
    const error = await failure(create(alice(), 'One more', { priority: [1] }));
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'favorites_limit',
      message: 'You can have at most 12 favorites',
    });
    // The same view as an existing one still answers with it
    const existing = firstOf(await list(alice()));
    expect((await create(alice(), 'again', existing.view)).data.id).toBe(existing.id);
    // Another user is not affected
    await create(bob(), 'Mine', { priority: [1] });
  });

  it('gives each user their own list', async () => {
    await create(alice(), 'A', { sort: 'due' });
    expect(await list(bob())).toEqual([]);
  });
});

describe('favorites.list', () => {
  it('orders by position, leaves out deleted ones, and returns ISO times', async () => {
    const a = await create(alice(), 'A', { sort: 'due' });
    await create(alice(), 'B', { sort: 'title' });
    const c = await create(alice(), 'C', { sort: 'created' });
    await run(alice(), 'favorites.delete', { id: a.data.id });
    expect(await names(alice())).toEqual(['B', 'C']);
    const [first] = await list(alice());
    expect(first?.createdAt).toMatch(/Z$/);
    expect(c.data.position).toBe(3072);
  });

  it('breaks ties in position by creation time', async () => {
    const a = await create(alice(), 'A', { sort: 'due' });
    const b = await create(alice(), 'B', { sort: 'title' });
    await t.db
      .update(taskFavorites)
      .set({ position: 5 })
      .where(sql`${taskFavorites.id} in (${a.data.id}, ${b.data.id})`);
    expect(await names(alice())).toEqual(['A', 'B']);
  });
});

describe('favorites.update', () => {
  it('changes name, color, and icon, and undoes with the old values', async () => {
    const { data } = await create(alice(), 'Old', { sort: 'due' });
    const result = await run(alice(), 'favorites.update', {
      id: data.id,
      name: 'New',
      color: TAG_PALETTE[4],
      icon: 'heart',
    });
    expect(result.data).toMatchObject({ name: 'New', color: TAG_PALETTE[4], icon: 'heart' });
    await undo(result);
    expect((await list(alice()))[0]).toMatchObject({
      name: 'Old',
      color: data.color,
      icon: data.icon,
    });
  });

  it('has no undo when nothing changes', async () => {
    const { data } = await create(alice(), 'Same', { sort: 'due' });
    const result = await run(alice(), 'favorites.update', { id: data.id, name: 'Same' });
    expect(result.undo).toBeNull();
  });

  it('rejects an empty change with a ZodError and gives 404 for unknown and foreign ids', async () => {
    const { data } = await create(alice(), 'Mine', { sort: 'due' });
    expect(await failure(run(alice(), 'favorites.update', { id: data.id }))).toBeInstanceOf(
      ZodError,
    );
    expect(await status(run(alice(), 'favorites.update', { id: MISSING, name: 'x' }))).toBe(404);
    expect(await status(run(bob(), 'favorites.update', { id: data.id, name: 'hacked' }))).toBe(404);
    expect(await names(alice())).toEqual(['Mine']);
  });

  it('gives 404 for a deleted favorite', async () => {
    const { data } = await create(alice(), 'Gone', { sort: 'due' });
    await run(alice(), 'favorites.delete', { id: data.id });
    expect(await status(run(alice(), 'favorites.update', { id: data.id, name: 'x' }))).toBe(404);
  });
});

describe('favorites.move', () => {
  const three = async () => {
    const a = (await create(alice(), 'A', { sort: 'due' })).data;
    const b = (await create(alice(), 'B', { sort: 'title' })).data;
    const c = (await create(alice(), 'C', { sort: 'created' })).data;
    return { a, b, c };
  };

  it('puts a favorite below a neighbour (afterId), above one (beforeId), or between two', async () => {
    const { a, b, c } = await three();
    await run(alice(), 'favorites.move', { id: a.id, afterId: c.id });
    expect(await names(alice())).toEqual(['B', 'C', 'A']);
    await run(alice(), 'favorites.move', { id: a.id, beforeId: b.id });
    expect(await names(alice())).toEqual(['A', 'B', 'C']);
    await run(alice(), 'favorites.move', { id: c.id, afterId: a.id, beforeId: b.id });
    expect(await names(alice())).toEqual(['A', 'C', 'B']);
  });

  it('places the new position at the middle, last + 1024, or first - 1024', async () => {
    const { a, b, c } = await three();
    const middle = await run(alice(), 'favorites.move', { id: c.id, afterId: a.id });
    expect(middle.data.position).toBe((1024 + 2048) / 2);
    const last = await run(alice(), 'favorites.move', { id: a.id, afterId: b.id });
    expect(last.data.position).toBe(2048 + 1024);
    const first = await run(alice(), 'favorites.move', { id: b.id, beforeId: c.id });
    expect(first.data.position).toBe(1536 - 1024);
  });

  it('renumbers all favorites when the gap is too small', async () => {
    const { a, b, c } = await three();
    await t.db.update(taskFavorites).set({ position: 10 }).where(eq(taskFavorites.id, a.id));
    await t.db.update(taskFavorites).set({ position: 10 }).where(eq(taskFavorites.id, b.id));
    await t.db.update(taskFavorites).set({ position: 11 }).where(eq(taskFavorites.id, c.id));
    const result = await run(alice(), 'favorites.move', {
      id: c.id,
      afterId: a.id,
      beforeId: b.id,
    });
    expect(result.data.id).toBe(c.id);
    const items = await list(alice());
    expect(items.map((item) => item.name)).toEqual(['A', 'C', 'B']);
    expect(items.map((item) => item.position)).toEqual([1024, 1536, 2048]);
  });

  it('undoes a move by putting the favorite back between its old neighbours', async () => {
    const { a, b, c } = await three();
    const moved = await run(alice(), 'favorites.move', { id: b.id, afterId: c.id });
    expect(await names(alice())).toEqual(['A', 'C', 'B']);
    expect(moved.undo).toEqual({
      action: 'favorites.move',
      input: { id: b.id, afterId: a.id, beforeId: c.id },
    });
    await undo(moved);
    expect(await names(alice())).toEqual(['A', 'B', 'C']);
    // From the top: only a beforeId is remembered
    const top = await run(alice(), 'favorites.move', { id: a.id, afterId: c.id });
    expect(undoOf(top).input).toEqual({ id: a.id, beforeId: b.id });
    await undo(top);
    expect(await names(alice())).toEqual(['A', 'B', 'C']);
  });

  it('rejects wrong neighbours', async () => {
    const { a, b, c } = await three();
    expect(await status(run(alice(), 'favorites.move', { id: a.id, afterId: a.id }))).toBe(400);
    expect(await status(run(alice(), 'favorites.move', { id: a.id, afterId: MISSING }))).toBe(404);
    expect(await status(run(alice(), 'favorites.move', { id: MISSING, afterId: a.id }))).toBe(404);
    // afterId must be above beforeId
    expect(
      await status(run(alice(), 'favorites.move', { id: a.id, afterId: c.id, beforeId: b.id })),
    ).toBe(400);
    expect(await failure(run(alice(), 'favorites.move', { id: a.id }))).toBeInstanceOf(ZodError);
    expect(await names(alice())).toEqual(['A', 'B', 'C']);
  });

  it('refuses a deleted favorite as the moved one or as a neighbour', async () => {
    const { a, b } = await three();
    await run(alice(), 'favorites.delete', { id: b.id });
    expect(await status(run(alice(), 'favorites.move', { id: a.id, afterId: b.id }))).toBe(404);
    expect(await status(run(alice(), 'favorites.move', { id: b.id, afterId: a.id }))).toBe(404);
  });

  it('never lets another user move or use a favorite', async () => {
    const { a, b } = await three();
    const bobs = (await create(bob(), 'Bobs', { sort: 'due' })).data;
    expect(await status(run(bob(), 'favorites.move', { id: a.id, afterId: bobs.id }))).toBe(404);
    expect(await status(run(alice(), 'favorites.move', { id: a.id, afterId: bobs.id }))).toBe(404);
    expect(await status(run(alice(), 'favorites.move', { id: bobs.id, afterId: b.id }))).toBe(404);
    expect(await names(alice())).toEqual(['A', 'B', 'C']);
    expect(await names(bob())).toEqual(['Bobs']);
  });
});

describe('favorites.delete and favorites.restore', () => {
  it('soft deletes with a restore undo, and restore undoes with a delete', async () => {
    const { data } = await create(alice(), 'A', { sort: 'due' });
    const deleted = await run(alice(), 'favorites.delete', { id: data.id });
    expect(deleted.undo).toEqual({ action: 'favorites.restore', input: { id: data.id } });
    expect(await list(alice())).toEqual([]);
    const [row] = await t.db.select().from(taskFavorites).where(eq(taskFavorites.id, data.id));
    expect(row?.deletedAt).not.toBeNull();
    const restored = await undo(deleted);
    expect(restored.data.id).toBe(data.id);
    expect(restored.undo).toEqual({ action: 'favorites.delete', input: { id: data.id } });
    expect(await names(alice())).toEqual(['A']);
    await undo(restored);
    expect(await list(alice())).toEqual([]);
  });

  it('keeps the old place in the list after a restore', async () => {
    const a = (await create(alice(), 'A', { sort: 'due' })).data;
    await create(alice(), 'B', { sort: 'title' });
    await run(alice(), 'favorites.delete', { id: a.id });
    await run(alice(), 'favorites.restore', { id: a.id });
    expect(await names(alice())).toEqual(['A', 'B']);
  });

  it('gives 404 for deleting twice, unknown ids, and other users', async () => {
    const { data } = await create(alice(), 'A', { sort: 'due' });
    expect(await status(run(bob(), 'favorites.delete', { id: data.id }))).toBe(404);
    expect(await status(run(alice(), 'favorites.delete', { id: MISSING }))).toBe(404);
    await run(alice(), 'favorites.delete', { id: data.id });
    expect(await status(run(alice(), 'favorites.delete', { id: data.id }))).toBe(404);
    expect(await status(run(bob(), 'favorites.restore', { id: data.id }))).toBe(404);
    expect(await status(run(alice(), 'favorites.restore', { id: MISSING }))).toBe(404);
    expect(await list(alice())).toEqual([]);
    await run(alice(), 'favorites.restore', { id: data.id });
    expect(await names(alice())).toEqual(['A']);
  });

  it('restoring a live favorite changes nothing', async () => {
    const { data } = await create(alice(), 'A', { sort: 'due' });
    const result = await run(alice(), 'favorites.restore', { id: data.id });
    expect(result.data.id).toBe(data.id);
    expect(result.undo).toBeNull();
  });

  it('refuses to restore when 12 live favorites exist', async () => {
    const first = (await create(alice(), 'First', { priority: [1] })).data;
    await run(alice(), 'favorites.delete', { id: first.id });
    await fill(alice(), MAX_FAVORITES);
    expect(await status(run(alice(), 'favorites.restore', { id: first.id }))).toBe(409);
    await run(alice(), 'favorites.delete', { id: firstOf(await list(alice())).id });
    expect((await run(alice(), 'favorites.restore', { id: first.id })).data.id).toBe(first.id);
  });

  it('drops tag ids that were deleted since, and refuses a view with nothing left', async () => {
    const keep = await makeTag(alice(), 'keep');
    const gone = await makeTag(alice(), 'gone');
    const mixed = (await create(alice(), 'M', { tagIds: [keep.id, gone.id] })).data;
    const only = (await create(alice(), 'O', { tagIds: [gone.id] })).data;
    await run(alice(), 'favorites.delete', { id: mixed.id });
    await run(alice(), 'favorites.delete', { id: only.id });
    await t.db.execute(sql`update tags set deleted_at = now() where id = ${gone.id}`);
    const restored = await run(alice(), 'favorites.restore', { id: mixed.id });
    expect(restored.data.view).toEqual({ tagIds: [keep.id] });
    expect(await status(run(alice(), 'favorites.restore', { id: only.id }))).toBe(400);
  });

  it('returns the live favorite with the same view instead of a duplicate', async () => {
    const first = (await create(alice(), 'A', { sort: 'due' })).data;
    await run(alice(), 'favorites.delete', { id: first.id });
    const second = (await create(alice(), 'B', { sort: 'due' })).data;
    const result = await run(alice(), 'favorites.restore', { id: first.id });
    expect(result.data.id).toBe(second.id);
    expect(result.undo).toBeNull();
    expect(await names(alice())).toEqual(['B']);
  });
});

describe('favorite colors', () => {
  it('match the palette ignoring case and store the palette spelling', async () => {
    const result = await create(
      alice(),
      'X',
      { sort: 'due' },
      { color: TAG_PALETTE[2].toLowerCase() },
    );
    expect(result.data.color).toBe(TAG_PALETTE[2]);
    const updated = await run(alice(), 'favorites.update', {
      id: result.data.id,
      color: TAG_PALETTE[4].toLowerCase(),
    });
    expect(updated.data.color).toBe(TAG_PALETTE[4]);
  });
});

describe('favorites written at the same time', () => {
  it('two creates with 11 favorites: one wins, the other gets favorites_limit', async () => {
    await fill(alice(), MAX_FAVORITES - 1);
    const results = await Promise.allSettled([
      create(alice(), 'P', { priority: [1] }),
      create(alice(), 'Q', { priority: [2] }),
    ]);
    expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((entry) => entry.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      statusCode: 409,
      code: 'favorites_limit',
    });
    expect(await list(alice())).toHaveLength(MAX_FAVORITES);
  });

  it('two identical views at once give one favorite', async () => {
    const [a, b] = await Promise.all([
      create(alice(), 'A', { sort: 'due' }),
      create(alice(), 'B', { sort: 'due' }),
    ]);
    expect(a.data.id).toBe(b.data.id);
    expect(await list(alice())).toHaveLength(1);
  });
});
