import { entities, links, noteFolders, noteTemplates, notes } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { Note, NoteSummary } from '@personal-os/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';
import { purgeIds } from './notes';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

let t: TestDb;
const registry = createRegistry();

const context = (userId: string, confirmed = true): ActionContext => ({
  scope: createUserScope(t.db, userId),
  source: 'ui',
  confirmed,
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
    sql`truncate table notes, note_templates, note_folders, entity_tags, tags, links, tasks, entities, auth.users cascade`,
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
const run = async <T>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const undoOf = (result: Result<unknown>): Undo => {
  if (!result.undo) throw new Error('Expected an undo');
  return result.undo;
};
const noteOf = async (ctx: ActionContext, title?: string, more: Record<string, unknown> = {}) =>
  (await run<Note>(ctx, 'notes.create', { ...(title ? { title } : {}), ...more })).data;
const getNote = async (ctx: ActionContext, id: string) =>
  (await run<Note>(ctx, 'notes.get', { id })).data;
const listOf = async (ctx: ActionContext, input: Record<string, unknown> = {}) =>
  (await run<NoteSummary[]>(ctx, 'notes.list', input)).data;
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return { status: error.statusCode, code: error.code };
    throw error;
  }
  return { status: 0, code: '' };
};
const folderOf = async (userId: string, name: string) => {
  const [row] = await createUserScope(t.db, userId).insert(noteFolders, { name });
  if (!row) throw new Error('no folder');
  return row;
};
const entityCount = async () => (await t.db.select().from(entities)).length;

describe('notes.create', () => {
  it('creates the entity and the note, with plain text made from the Markdown', async () => {
    const result = await run<Note>(alice(), 'notes.create', {
      title: '  Plan  ',
      contentMd: '# Head\n\nSome **bold** and [[Other]] text',
    });
    expect(result.data).toMatchObject({
      title: 'Plan',
      revision: 1,
      pinned: false,
      folderId: null,
      deletedAt: null,
      excerpt: 'Head Some bold and Other text',
    });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, result.data.id));
    expect(entity).toMatchObject({ type: 'note', title: 'Plan', userId: ALICE });
    const [row] = await t.db.select().from(notes).where(eq(notes.id, result.data.id));
    expect(row?.contentText).toBe('Head\nSome bold and Other text');
    expect(row?.contentMd).toContain('**bold**');
  });

  it('names new notes Untitled, Untitled 2, Untitled 3 (filling gaps, ignoring case)', async () => {
    const first = await noteOf(alice());
    const second = await noteOf(alice());
    const third = await noteOf(alice());
    expect([first.title, second.title, third.title]).toEqual([
      'Untitled',
      'Untitled 2',
      'Untitled 3',
    ]);
    await run(alice(), 'notes.rename', { id: second.id, title: 'untitled 2 x' });
    expect((await noteOf(alice())).title).toBe('Untitled 2');
  });

  it('two creates at the same time get different default titles', async () => {
    const both = await Promise.all([noteOf(alice()), noteOf(alice())]);
    expect(new Set(both.map((n) => n.title)).size).toBe(2);
  });

  it('answers 409 note_title_taken for a title in use, ignoring case, but not for a trashed one', async () => {
    const first = await noteOf(alice(), 'Ideas');
    expect(await failure(registry.run(alice(), 'notes.create', { title: 'IDEAS' }))).toEqual({
      status: 409,
      code: 'note_title_taken',
    });
    await run(alice(), 'notes.delete', { id: first.id });
    expect((await noteOf(alice(), 'ideas')).title).toBe('ideas');
  });

  it('lets two users use the same title', async () => {
    await noteOf(alice(), 'Same');
    expect((await noteOf(bob(), 'Same')).title).toBe('Same');
  });

  it('rejects bad titles and too long text (ZodError)', async () => {
    for (const title of ['', '   ', 'a[b', 'a]b', 'a|b', 'a#b', 'x'.repeat(201)]) {
      await expect(registry.run(alice(), 'notes.create', { title })).rejects.toBeInstanceOf(
        ZodError,
      );
    }
    await expect(
      registry.run(alice(), 'notes.create', { contentMd: 'x'.repeat(200_001) }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('puts a note in a live folder; a missing, trashed or foreign folder is 404', async () => {
    const folder = await folderOf(ALICE, 'Work');
    expect((await noteOf(alice(), 'In', { folderId: folder.id })).folderId).toBe(folder.id);
    const foreign = await folderOf(BOB, 'Bobs');
    for (const folderId of [MISSING, foreign.id]) {
      expect(await failure(registry.run(alice(), 'notes.create', { folderId }))).toMatchObject({
        status: 404,
      });
    }
    await createUserScope(t.db, ALICE).softDelete(noteFolders, eq(noteFolders.id, folder.id));
    expect(
      await failure(registry.run(alice(), 'notes.create', { folderId: folder.id })),
    ).toMatchObject({ status: 404 });
    expect(await entityCount()).toBe(1);
  });

  it('undo removes the note to the trash', async () => {
    const created = await run<Note>(alice(), 'notes.create', { title: 'A' });
    await run(alice(), undoOf(created).action, undoOf(created).input);
    expect(await listOf(alice())).toEqual([]);
    expect((await listOf(alice(), { trash: true })).map((n) => n.title)).toEqual(['A']);
  });
});

describe('notes.get', () => {
  it('returns the Markdown and revision; another user gets 404', async () => {
    const note = await noteOf(alice(), 'A', { contentMd: 'hello' });
    expect(await getNote(alice(), note.id)).toMatchObject({ contentMd: 'hello', revision: 1 });
    expect(await failure(registry.run(bob(), 'notes.get', { id: note.id }))).toMatchObject({
      status: 404,
    });
    expect(await failure(registry.run(alice(), 'notes.get', { id: MISSING }))).toMatchObject({
      status: 404,
    });
    await expect(registry.run(alice(), 'notes.get', { id: 'nope' })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it('can read a trashed note (the Trash view)', async () => {
    const note = await noteOf(alice(), 'A');
    await run(alice(), 'notes.delete', { id: note.id });
    expect((await getNote(alice(), note.id)).deletedAt).not.toBeNull();
  });
});

describe('notes.list', () => {
  it('never sends the text, only an excerpt of at most 140 characters', async () => {
    await noteOf(alice(), 'Long', { contentMd: 'word '.repeat(100) });
    const [item] = await listOf(alice());
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('contentMd');
    expect(item).not.toHaveProperty('contentText');
    expect(item?.excerpt.length).toBeLessThanOrEqual(141);
    expect(item?.excerpt.endsWith('…')).toBe(true);
  });

  it('puts pinned notes first, then sorts by updated (default), title or created', async () => {
    const a = await noteOf(alice(), 'banana');
    const b = await noteOf(alice(), 'Apple');
    const c = await noteOf(alice(), 'cherry');
    await run(alice(), 'notes.update', { id: a.id, baseRevision: 1, contentMd: 'x' });
    expect((await listOf(alice())).map((n) => n.title)).toEqual(['banana', 'cherry', 'Apple']);
    expect((await listOf(alice(), { sort: 'title' })).map((n) => n.title)).toEqual([
      'Apple',
      'banana',
      'cherry',
    ]);
    expect((await listOf(alice(), { sort: 'created' })).map((n) => n.title)).toEqual([
      'cherry',
      'Apple',
      'banana',
    ]);
    await run(alice(), 'notes.update', { id: c.id, baseRevision: 1, pinned: true });
    await run(alice(), 'notes.update', { id: b.id, baseRevision: 1, pinned: true });
    expect((await listOf(alice(), { sort: 'title' })).map((n) => n.title)).toEqual([
      'Apple',
      'cherry',
      'banana',
    ]);
  });

  it('filters by folder, by "none", and shows live or trashed notes', async () => {
    const folder = await folderOf(ALICE, 'F');
    const inside = await noteOf(alice(), 'In', { folderId: folder.id });
    const outside = await noteOf(alice(), 'Out');
    expect((await listOf(alice(), { folderId: folder.id })).map((n) => n.id)).toEqual([inside.id]);
    expect((await listOf(alice(), { folderId: 'none' })).map((n) => n.id)).toEqual([outside.id]);
    await run(alice(), 'notes.delete', { id: inside.id });
    expect((await listOf(alice())).map((n) => n.id)).toEqual([outside.id]);
    expect((await listOf(alice(), { trash: true })).map((n) => n.id)).toEqual([inside.id]);
  });

  it('pages with limit and offset, validates them, and shows only the own notes', async () => {
    for (const title of ['a', 'b', 'c']) await noteOf(alice(), title);
    await noteOf(bob(), 'bobs');
    expect((await listOf(alice(), { sort: 'title', limit: 2 })).map((n) => n.title)).toEqual([
      'a',
      'b',
    ]);
    expect(
      (await listOf(alice(), { sort: 'title', limit: 2, offset: 2 })).map((n) => n.title),
    ).toEqual(['c']);
    expect((await listOf(bob())).map((n) => n.title)).toEqual(['bobs']);
    await expect(registry.run(alice(), 'notes.list', { limit: 0 })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(registry.run(alice(), 'notes.list', { sort: 'size' })).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});

describe('notes.update', () => {
  it('saves content, makes plain text, raises the revision, and returns an undo', async () => {
    const note = await noteOf(alice(), 'A', { contentMd: 'one' });
    const result = await run<Note>(alice(), 'notes.update', {
      id: note.id,
      baseRevision: 1,
      contentMd: '## Two\n\n- three',
    });
    expect(result.data).toMatchObject({ revision: 2, contentMd: '## Two\n\n- three' });
    const [row] = await t.db.select().from(notes).where(eq(notes.id, note.id));
    expect(row?.contentText).toBe('Two\nthree');
    // Undo puts the old text back (a new revision)
    await run(alice(), undoOf(result).action, undoOf(result).input);
    expect(await getNote(alice(), note.id)).toMatchObject({ contentMd: 'one', revision: 3 });
  });

  it('answers 409 note_conflict when the revision is old, and changes nothing', async () => {
    const note = await noteOf(alice(), 'A');
    await run(alice(), 'notes.update', { id: note.id, baseRevision: 1, contentMd: 'theirs' });
    expect(
      await failure(
        registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 1, contentMd: 'mine' }),
      ),
    ).toEqual({ status: 409, code: 'note_conflict' });
    expect(await getNote(alice(), note.id)).toMatchObject({ contentMd: 'theirs', revision: 2 });
  });

  it('force ("keep mine") skips the revision check', async () => {
    const note = await noteOf(alice(), 'A');
    await run(alice(), 'notes.update', { id: note.id, baseRevision: 1, contentMd: 'theirs' });
    const result = await run<Note>(alice(), 'notes.update', {
      id: note.id,
      baseRevision: 1,
      contentMd: 'mine',
      force: true,
    });
    expect(result.data).toMatchObject({ contentMd: 'mine', revision: 3 });
  });

  it('changes folder and pin without raising the revision; null moves out of a folder', async () => {
    const folder = await folderOf(ALICE, 'F');
    const note = await noteOf(alice(), 'A');
    const moved = await run<Note>(alice(), 'notes.update', {
      id: note.id,
      baseRevision: 1,
      folderId: folder.id,
      pinned: true,
    });
    expect(moved.data).toMatchObject({ folderId: folder.id, pinned: true, revision: 1 });
    await run(alice(), undoOf(moved).action, undoOf(moved).input);
    expect(await getNote(alice(), note.id)).toMatchObject({ folderId: null, pinned: false });
    await run(alice(), 'notes.update', { id: note.id, baseRevision: 1, folderId: folder.id });
    expect(
      (
        await run<Note>(alice(), 'notes.update', {
          id: note.id,
          baseRevision: 1,
          folderId: null,
        })
      ).data.folderId,
    ).toBeNull();
  });

  it('does nothing (no undo, same revision) when the values are the same', async () => {
    const note = await noteOf(alice(), 'A', { contentMd: 'same' });
    const result = await run<Note>(alice(), 'notes.update', {
      id: note.id,
      baseRevision: 1,
      contentMd: 'same',
    });
    expect(result.undo).toBeNull();
    expect(result.data.revision).toBe(1);
  });

  it('rejects empty changes, a bad id and a 404 folder', async () => {
    const note = await noteOf(alice(), 'A');
    await expect(
      registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 1 }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 0, pinned: true }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(
      await failure(
        registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 1, folderId: MISSING }),
      ),
    ).toMatchObject({ status: 404 });
    expect(
      await failure(
        registry.run(alice(), 'notes.update', { id: MISSING, baseRevision: 1, pinned: true }),
      ),
    ).toMatchObject({ status: 404 });
  });

  it('cannot change a trashed note or another user note', async () => {
    const note = await noteOf(alice(), 'A');
    expect(
      await failure(
        registry.run(bob(), 'notes.update', { id: note.id, baseRevision: 1, contentMd: 'x' }),
      ),
    ).toMatchObject({ status: 404 });
    await run(alice(), 'notes.delete', { id: note.id });
    expect(
      await failure(
        registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 1, contentMd: 'x' }),
      ),
    ).toMatchObject({ status: 404 });
    expect((await getNote(alice(), note.id)).contentMd).toBe('');
  });

  it('of two saves with the same revision, only one wins', async () => {
    const note = await noteOf(alice(), 'A');
    const results = await Promise.allSettled(
      ['x', 'y'].map((contentMd) =>
        registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 1, contentMd }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getNote(alice(), note.id)).revision).toBe(2);
  });
});

describe('notes.update without content and with folders', () => {
  it('a pin or a move with an old baseRevision is not a conflict and keeps the revision', async () => {
    const folder = await folderOf(ALICE, 'F');
    const note = await noteOf(alice(), 'A');
    await run(alice(), 'notes.update', { id: note.id, baseRevision: 1, contentMd: 'x' });
    const pinned = await run<Note>(alice(), 'notes.update', {
      id: note.id,
      baseRevision: 1,
      pinned: true,
      folderId: folder.id,
    });
    expect(pinned.data).toMatchObject({ pinned: true, folderId: folder.id, revision: 2 });
    expect(
      await failure(
        registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 1, contentMd: 'y' }),
      ),
    ).toEqual({ status: 409, code: 'note_conflict' });
  });

  it('a move that is queued first wins over a folder delete at the same moment', async () => {
    const folder = await folderOf(ALICE, 'F');
    const note = await noteOf(alice(), 'A');
    const [move, del] = await Promise.allSettled([
      registry.run(alice(), 'notes.update', { id: note.id, baseRevision: 1, folderId: folder.id }),
      registry.run(alice(), 'noteFolders.delete', { id: folder.id }),
    ]);
    expect(move.status).toBe('fulfilled');
    expect(del).toMatchObject({ status: 'rejected', reason: { code: 'folder_not_empty' } });
    expect((await getNote(alice(), note.id)).folderId).toBe(folder.id);
  });

  it('a note create queued after a folder delete is a 404 and leaves no note', async () => {
    const folder = await folderOf(ALICE, 'F');
    const [del, create] = await Promise.allSettled([
      registry.run(alice(), 'noteFolders.delete', { id: folder.id }),
      registry.run(alice(), 'notes.create', { title: 'N', folderId: folder.id }),
    ]);
    expect(del.status).toBe('fulfilled');
    expect(create).toMatchObject({ status: 'rejected', reason: { statusCode: 404 } });
    expect(await t.db.select().from(notes)).toHaveLength(0);
  });
});

describe('notes.rename', () => {
  it('renames the note and its entity, raises the revision, undo renames back', async () => {
    const note = await noteOf(alice(), 'Old');
    const result = await run<Note>(alice(), 'notes.rename', { id: note.id, title: ' New ' });
    expect(result.data).toMatchObject({ title: 'New', revision: 2 });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, note.id));
    expect(entity?.title).toBe('New');
    await run(alice(), undoOf(result).action, undoOf(result).input);
    const [back] = await t.db.select().from(entities).where(eq(entities.id, note.id));
    expect(back?.title).toBe('Old');
    expect((await getNote(alice(), note.id)).title).toBe('Old');
  });

  it('allows a change of case only, and does nothing for the same title', async () => {
    const note = await noteOf(alice(), 'abc');
    expect(
      (await run<Note>(alice(), 'notes.rename', { id: note.id, title: 'ABC' })).data.title,
    ).toBe('ABC');
    const same = await run<Note>(alice(), 'notes.rename', { id: note.id, title: 'ABC' });
    expect(same.undo).toBeNull();
    expect(same.data.revision).toBe(2);
  });

  it('answers 409 note_title_taken, 400 for bad titles, 404 for others', async () => {
    const a = await noteOf(alice(), 'A');
    await noteOf(alice(), 'B');
    expect(await failure(registry.run(alice(), 'notes.rename', { id: a.id, title: 'b' }))).toEqual({
      status: 409,
      code: 'note_title_taken',
    });
    await expect(
      registry.run(alice(), 'notes.rename', { id: a.id, title: 'x|y' }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(
      await failure(registry.run(bob(), 'notes.rename', { id: a.id, title: 'Z' })),
    ).toMatchObject({ status: 404 });
    expect((await getNote(alice(), a.id)).title).toBe('A');
  });
});

describe('notes.delete and notes.restore', () => {
  it('delete is destructive: it needs confirmation, and the note stays when refused', async () => {
    const note = await noteOf(alice(), 'A');
    await expect(
      registry.run(context(ALICE, false), 'notes.delete', { id: note.id }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await listOf(alice())).toHaveLength(1);
    expect(registry.permissionOf('notes.delete')).toBe('destructive');
    expect(registry.permissionOf('notes.restore')).toBe('write');
    expect(registry.permissionOf('notes.purge')).toBe('destructive');
    expect(registry.permissionOf('notes.emptyTrash')).toBe('destructive');
  });

  it('moves the note and its entity to the trash; the undo restores both', async () => {
    const note = await noteOf(alice(), 'A');
    const result = await run<Note>(alice(), 'notes.delete', { id: note.id });
    expect(result.data.deletedAt).not.toBeNull();
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, note.id));
    expect(entity?.deletedAt).not.toBeNull();
    expect(await listOf(alice())).toEqual([]);
    const restored = await run<Note>(alice(), undoOf(result).action, undoOf(result).input);
    expect(restored.data.deletedAt).toBeNull();
    const [after] = await t.db.select().from(entities).where(eq(entities.id, note.id));
    expect(after?.deletedAt).toBeNull();
    expect(await listOf(alice())).toHaveLength(1);
  });

  it('deleting twice is 404; restoring a live note changes nothing; unknown is 404', async () => {
    const note = await noteOf(alice(), 'A');
    await run(alice(), 'notes.delete', { id: note.id });
    expect(await failure(registry.run(alice(), 'notes.delete', { id: note.id }))).toMatchObject({
      status: 404,
    });
    await run(alice(), 'notes.restore', { id: note.id });
    expect((await run(alice(), 'notes.restore', { id: note.id })).undo).toBeNull();
    expect(await failure(registry.run(alice(), 'notes.restore', { id: MISSING }))).toMatchObject({
      status: 404,
    });
  });

  it('restore adds " (2)" when the title was taken meanwhile, and a free title is kept', async () => {
    const note = await noteOf(alice(), 'Plan');
    await run(alice(), 'notes.delete', { id: note.id });
    await noteOf(alice(), 'plan');
    const restored = await run<Note>(alice(), 'notes.restore', { id: note.id });
    expect(restored.data.title).toBe('Plan (2)');
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, note.id));
    expect(entity?.title).toBe('Plan (2)');
    const other = await noteOf(alice(), 'Free');
    await run(alice(), 'notes.delete', { id: other.id });
    expect((await run<Note>(alice(), 'notes.restore', { id: other.id })).data.title).toBe('Free');
  });

  it('restore moves a note out of a folder that was deleted meanwhile', async () => {
    const folder = await folderOf(ALICE, 'F');
    const note = await noteOf(alice(), 'A', { folderId: folder.id });
    await run(alice(), 'notes.delete', { id: note.id });
    await createUserScope(t.db, ALICE).softDelete(noteFolders, eq(noteFolders.id, folder.id));
    expect((await run<Note>(alice(), 'notes.restore', { id: note.id })).data.folderId).toBeNull();
  });
});

describe('notes.purge and notes.emptyTrash', () => {
  const linkTo = async (sourceId: string, targetId: string) =>
    createUserScope(t.db, ALICE).insert(links, { sourceId, targetId, relation: 'mentions' });

  it('purge only works on trashed notes (400), and removes the entity, note and links', async () => {
    const a = await noteOf(alice(), 'A');
    const b = await noteOf(alice(), 'B');
    await linkTo(a.id, b.id);
    expect(await failure(registry.run(alice(), 'notes.purge', { id: a.id }))).toEqual({
      status: 400,
      code: 'validation_error',
    });
    await run(alice(), 'notes.delete', { id: a.id });
    const result = await run(alice(), 'notes.purge', { id: a.id });
    expect(result.undo ?? null).toBeNull();
    expect(await t.db.select().from(notes).where(eq(notes.id, a.id))).toHaveLength(0);
    expect(await t.db.select().from(entities).where(eq(entities.id, a.id))).toHaveLength(0);
    expect(await t.db.select().from(links)).toHaveLength(0);
    expect((await getNote(alice(), b.id)).title).toBe('B');
    expect(await failure(registry.run(alice(), 'notes.purge', { id: a.id }))).toMatchObject({
      status: 404,
    });
  });

  it('a restored note is not purged (the delete checks the trash flag itself)', async () => {
    const a = await noteOf(alice(), 'A');
    await run(alice(), 'notes.delete', { id: a.id });
    await run(alice(), 'notes.restore', { id: a.id });
    await purgeIds(createUserScope(t.db, ALICE), [a.id]);
    expect((await getNote(alice(), a.id)).title).toBe('A');
    expect(await t.db.select().from(entities).where(eq(entities.id, a.id))).toHaveLength(1);
  });

  it('purge needs confirmation', async () => {
    const note = await noteOf(alice(), 'A');
    await run(alice(), 'notes.delete', { id: note.id });
    await expect(
      registry.run(context(ALICE, false), 'notes.purge', { id: note.id }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await listOf(alice(), { trash: true })).toHaveLength(1);
  });

  it('another user cannot purge a trashed note', async () => {
    const note = await noteOf(alice(), 'A');
    await run(alice(), 'notes.delete', { id: note.id });
    expect(await failure(registry.run(bob(), 'notes.purge', { id: note.id }))).toMatchObject({
      status: 404,
    });
    expect(await listOf(alice(), { trash: true })).toHaveLength(1);
  });

  it('emptyTrash removes every trashed note of this user only', async () => {
    const a = await noteOf(alice(), 'A');
    const keep = await noteOf(alice(), 'Keep');
    const b = await noteOf(alice(), 'B');
    const bobs = await noteOf(bob(), 'Bobs');
    await run(alice(), 'notes.delete', { id: a.id });
    await run(alice(), 'notes.delete', { id: b.id });
    await run(bob(), 'notes.delete', { id: bobs.id });
    const result = await run<{ deleted: number }>(alice(), 'notes.emptyTrash', {});
    expect(result.data.deleted).toBe(2);
    expect(await listOf(alice(), { trash: true })).toEqual([]);
    expect((await listOf(alice())).map((n) => n.id)).toEqual([keep.id]);
    expect(await listOf(bob(), { trash: true })).toHaveLength(1);
    expect(await t.db.select().from(notes)).toHaveLength(2);
    expect((await run<{ deleted: number }>(alice(), 'notes.emptyTrash', {})).data.deleted).toBe(0);
  });

  it('emptyTrash needs confirmation', async () => {
    await expect(registry.run(context(ALICE, false), 'notes.emptyTrash', {})).rejects.toMatchObject(
      { statusCode: 409 },
    );
  });
});

describe('notes.create with a template that grows too long', () => {
  it('answers 400 when the filled template exceeds the note limit', async () => {
    const [template] = await createUserScope(t.db, ALICE).insert(noteTemplates, {
      name: 'Big',
      contentMd: '{{title}}'.repeat(15_000),
    });
    expect(
      await failure(
        registry.run(alice(), 'notes.create', { title: 'T'.repeat(20), templateId: template?.id }),
      ),
    ).toEqual({ status: 400, code: 'validation_error' });
    expect(await listOf(alice())).toEqual([]);
  });
});
