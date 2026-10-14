import { entities, notes } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { FOLDER_NAME_MAX, type NoteFolder } from '@personal-os/shared';
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
  await t.db.execute(sql`truncate table notes, note_folders, entities, auth.users cascade`);
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

const run = async <T = NoteFolder>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const make = async (ctx: ActionContext, name: string, parentId: string | null = null) =>
  (await run(ctx, 'noteFolders.create', { name, parentId })).data;
const list = async (ctx: ActionContext) =>
  (await run<NoteFolder[]>(ctx, 'noteFolders.list', {})).data;
const names = async (ctx: ActionContext) => (await list(ctx)).map((f) => f.name).sort();

/** Adds a note straight into the tables (the notes actions are another unit). */
let noteSeq = 0;
const addNote = async (userId: string, folderId: string | null, deleted = false) => {
  noteSeq += 1;
  const title = `Note ${String(noteSeq)}`;
  const [entity] = await t.db.insert(entities).values({ userId, type: 'note', title }).returning();
  if (!entity) throw new Error('no entity');
  await t.db.insert(notes).values({
    id: entity.id,
    userId,
    title,
    folderId,
    deletedAt: deleted ? new Date() : null,
  });
};

const fails = async (promise: Promise<unknown>, status: number, code: string) => {
  const error: unknown = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(HttpError);
  expect(error).toMatchObject({ statusCode: status, code });
};

describe('noteFolders.create', () => {
  it('creates a top-level folder with an undo that deletes it', async () => {
    const created = await run(alice(), 'noteFolders.create', { name: '  Work  ' });
    expect(created.data).toMatchObject({ name: 'Work', parentId: null, noteCount: 0 });
    expect(created.undo).toEqual({ action: 'noteFolders.delete', input: { id: created.data.id } });
    await run(alice(), created.undo?.action ?? '', created.undo?.input);
    expect(await list(alice())).toEqual([]);
  });

  it('rejects bad input with a ZodError', async () => {
    await expect(registry.run(alice(), 'noteFolders.create', { name: '   ' })).rejects.toThrow(
      ZodError,
    );
    await expect(registry.run(alice(), 'noteFolders.create', { name: 'a/b' })).rejects.toThrow(
      ZodError,
    );
    await expect(
      registry.run(alice(), 'noteFolders.create', { name: 'x'.repeat(FOLDER_NAME_MAX + 1) }),
    ).rejects.toThrow(ZodError);
  });

  it('allows three levels and refuses the fourth with folder_too_deep', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    const c = await make(alice(), 'C', b.id);
    await fails(
      run(alice(), 'noteFolders.create', { name: 'D', parentId: c.id }),
      400,
      'folder_too_deep',
    );
  });

  it('needs a live parent of the same user', async () => {
    const a = await make(alice(), 'A');
    await fails(run(bob(), 'noteFolders.create', { name: 'X', parentId: a.id }), 404, 'not_found');
    await fails(
      run(alice(), 'noteFolders.create', { name: 'X', parentId: MISSING }),
      404,
      'not_found',
    );
    await run(alice(), 'noteFolders.delete', { id: a.id });
    await fails(
      run(alice(), 'noteFolders.create', { name: 'X', parentId: a.id }),
      404,
      'not_found',
    );
  });

  it('refuses a duplicate name in the same parent ignoring case, but allows it elsewhere', async () => {
    const a = await make(alice(), 'A');
    await make(alice(), 'Work');
    await fails(run(alice(), 'noteFolders.create', { name: 'WORK' }), 409, 'folder_name_taken');
    await make(alice(), 'Work', a.id);
    await fails(
      run(alice(), 'noteFolders.create', { name: 'work', parentId: a.id }),
      409,
      'folder_name_taken',
    );
    // another user may use the same name
    await make(bob(), 'Work');
  });
});

describe('noteFolders.list', () => {
  it('counts live notes directly in each folder and hides other users', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    await addNote(ALICE, a.id);
    await addNote(ALICE, a.id);
    await addNote(ALICE, a.id, true);
    await addNote(ALICE, b.id);
    await addNote(ALICE, null);
    await make(bob(), 'Secret');
    const folders = await list(alice());
    expect(folders.map((f) => [f.name, f.noteCount]).sort()).toEqual([
      ['A', 2],
      ['B', 1],
    ]);
    expect(await names(bob())).toEqual(['Secret']);
  });

  it('leaves out deleted folders', async () => {
    const a = await make(alice(), 'A');
    await run(alice(), 'noteFolders.delete', { id: a.id });
    expect(await list(alice())).toEqual([]);
  });
});

describe('noteFolders.update', () => {
  it('renames and the undo puts the old name back', async () => {
    const a = await make(alice(), 'A');
    const renamed = await run(alice(), 'noteFolders.update', { id: a.id, name: 'Alpha' });
    expect(renamed.data.name).toBe('Alpha');
    await run(alice(), renamed.undo?.action ?? '', renamed.undo?.input);
    expect(await names(alice())).toEqual(['A']);
  });

  it('allows a rename that only changes case', async () => {
    const a = await make(alice(), 'work');
    const renamed = await run(alice(), 'noteFolders.update', { id: a.id, name: 'Work' });
    expect(renamed.data.name).toBe('Work');
  });

  it('returns no undo when nothing changes', async () => {
    const a = await make(alice(), 'A');
    const same = await run(alice(), 'noteFolders.update', { id: a.id, name: 'A' });
    expect(same.undo).toBeNull();
  });

  it('refuses a name already used in the parent', async () => {
    await make(alice(), 'A');
    const b = await make(alice(), 'B');
    await fails(
      run(alice(), 'noteFolders.update', { id: b.id, name: 'a' }),
      409,
      'folder_name_taken',
    );
  });

  it('moves into a folder and back to the top level with the undo', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B');
    const moved = await run(alice(), 'noteFolders.update', { id: b.id, parentId: a.id });
    expect(moved.data.parentId).toBe(a.id);
    const back = await run(alice(), moved.undo?.action ?? '', moved.undo?.input);
    expect(back.data.parentId).toBeNull();
    const again = await run(alice(), 'noteFolders.update', { id: b.id, parentId: a.id });
    const top = await run(alice(), 'noteFolders.update', { id: b.id, parentId: null });
    expect(again.data.parentId).toBe(a.id);
    expect(top.data.parentId).toBeNull();
  });

  it('refuses a name clash in the target parent when moving', async () => {
    const a = await make(alice(), 'A');
    await make(alice(), 'Same', a.id);
    const other = await make(alice(), 'same');
    await fails(
      run(alice(), 'noteFolders.update', { id: other.id, parentId: a.id }),
      409,
      'folder_name_taken',
    );
  });

  it('refuses a move into itself or its own descendants', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    const c = await make(alice(), 'C', b.id);
    await fails(
      run(alice(), 'noteFolders.update', { id: a.id, parentId: a.id }),
      400,
      'validation_error',
    );
    await fails(
      run(alice(), 'noteFolders.update', { id: a.id, parentId: b.id }),
      400,
      'validation_error',
    );
    await fails(
      run(alice(), 'noteFolders.update', { id: a.id, parentId: c.id }),
      400,
      'validation_error',
    );
  });

  it('counts the height of the moved subtree in the depth check', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    const x = await make(alice(), 'X');
    const y = await make(alice(), 'Y', x.id);
    // B (1 level) under Y (depth 2) gives 3: fine
    await run(alice(), 'noteFolders.update', { id: b.id, parentId: y.id });
    // X (with Y and B below it, 3 levels) under A would give 4
    await fails(
      run(alice(), 'noteFolders.update', { id: x.id, parentId: a.id }),
      400,
      'folder_too_deep',
    );
    // Y (2 levels) under A (depth 1) gives 3: fine
    const moved = await run(alice(), 'noteFolders.update', { id: y.id, parentId: a.id });
    expect(moved.data.parentId).toBe(a.id);
    // and now a 2-level subtree cannot go below a depth-2 folder
    const z = await make(alice(), 'Z');
    await fails(
      run(alice(), 'noteFolders.update', { id: z.id, parentId: b.id }),
      400,
      'folder_too_deep',
    );
  });

  it('is a 404 for another user, a missing folder, or a missing parent', async () => {
    const a = await make(alice(), 'A');
    const b = await make(bob(), 'B');
    await fails(run(bob(), 'noteFolders.update', { id: a.id, name: 'Hacked' }), 404, 'not_found');
    await fails(run(alice(), 'noteFolders.update', { id: MISSING, name: 'X' }), 404, 'not_found');
    await fails(run(alice(), 'noteFolders.update', { id: a.id, parentId: b.id }), 404, 'not_found');
    expect(await names(alice())).toEqual(['A']);
  });

  it('rejects an update with nothing to change', async () => {
    const a = await make(alice(), 'A');
    await expect(registry.run(alice(), 'noteFolders.update', { id: a.id })).rejects.toThrow(
      ZodError,
    );
  });
});

describe('noteFolders.delete and restore', () => {
  it('deletes an empty folder and the undo restores it', async () => {
    const a = await make(alice(), 'A');
    const deleted = await run(alice(), 'noteFolders.delete', { id: a.id });
    expect(deleted.undo).toEqual({ action: 'noteFolders.restore', input: { id: a.id } });
    expect(await list(alice())).toEqual([]);
    const restored = await run(alice(), deleted.undo?.action ?? '', deleted.undo?.input);
    expect(restored.data).toMatchObject({ id: a.id, name: 'A', parentId: null });
    expect(restored.undo).toEqual({ action: 'noteFolders.delete', input: { id: a.id } });
    expect(await names(alice())).toEqual(['A']);
  });

  it('needs confirmation as a destructive action', async () => {
    const a = await make(alice(), 'A');
    await expect(
      registry.run(context(ALICE, false), 'noteFolders.delete', { id: a.id }),
    ).rejects.toThrow();
    expect(await names(alice())).toEqual(['A']);
  });

  it('refuses a folder with live notes, counting them in the message', async () => {
    const a = await make(alice(), 'A');
    await addNote(ALICE, a.id);
    await addNote(ALICE, a.id);
    await addNote(ALICE, a.id);
    const error = await run(alice(), 'noteFolders.delete', { id: a.id }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'folder_not_empty',
      message: 'Move or delete the 3 notes in this folder first.',
    });
    expect(await names(alice())).toEqual(['A']);
  });

  it('uses the singular for one note and ignores trashed notes', async () => {
    const a = await make(alice(), 'A');
    await addNote(ALICE, a.id, true);
    await run(alice(), 'noteFolders.delete', { id: a.id }); // only a trashed note: allowed
    const b = await make(alice(), 'B');
    await addNote(ALICE, b.id);
    await expect(run(alice(), 'noteFolders.delete', { id: b.id })).rejects.toMatchObject({
      message: 'Move or delete the 1 note in this folder first.',
    });
  });

  it('refuses a folder with live sub-folders, but not after they are deleted', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    await fails(run(alice(), 'noteFolders.delete', { id: a.id }), 409, 'folder_not_empty');
    await run(alice(), 'noteFolders.delete', { id: b.id });
    await run(alice(), 'noteFolders.delete', { id: a.id });
    expect(await list(alice())).toEqual([]);
  });

  it('is a 404 for another user, a missing or an already deleted folder', async () => {
    const a = await make(alice(), 'A');
    await fails(run(bob(), 'noteFolders.delete', { id: a.id }), 404, 'not_found');
    await fails(run(alice(), 'noteFolders.delete', { id: MISSING }), 404, 'not_found');
    await run(alice(), 'noteFolders.delete', { id: a.id });
    await fails(run(alice(), 'noteFolders.delete', { id: a.id }), 404, 'not_found');
    await fails(run(bob(), 'noteFolders.restore', { id: a.id }), 404, 'not_found');
    expect(await list(alice())).toEqual([]);
  });

  it('restores inside its parent when the parent is still live', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    await run(alice(), 'noteFolders.delete', { id: b.id });
    const restored = await run(alice(), 'noteFolders.restore', { id: b.id });
    expect(restored.data.parentId).toBe(a.id);
  });

  it('restores to the top level when the parent was deleted', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    await run(alice(), 'noteFolders.delete', { id: b.id });
    await run(alice(), 'noteFolders.delete', { id: a.id });
    const restored = await run(alice(), 'noteFolders.restore', { id: b.id });
    expect(restored.data).toMatchObject({ name: 'B', parentId: null });
  });

  it('adds (2) when the name was taken meanwhile', async () => {
    const a = await make(alice(), 'Work');
    await run(alice(), 'noteFolders.delete', { id: a.id });
    await make(alice(), 'work');
    const first = await run(alice(), 'noteFolders.restore', { id: a.id });
    expect(first.data.name).toBe('Work (2)');
    await run(alice(), 'noteFolders.delete', { id: a.id });
    await make(alice(), 'Work (2)');
    const second = await run(alice(), 'noteFolders.restore', { id: a.id });
    expect(second.data.name).toBe('Work (2) (2)');
  });

  it('keeps the suffixed name within the length limit', async () => {
    const long = 'x'.repeat(FOLDER_NAME_MAX);
    const a = await make(alice(), long);
    await run(alice(), 'noteFolders.delete', { id: a.id });
    await make(alice(), long);
    const restored = await run(alice(), 'noteFolders.restore', { id: a.id });
    expect(restored.data.name).toHaveLength(FOLDER_NAME_MAX);
    expect(restored.data.name.endsWith(' (2)')).toBe(true);
  });

  it('restoring a live folder changes nothing', async () => {
    const a = await make(alice(), 'A');
    const result = await run(alice(), 'noteFolders.restore', { id: a.id });
    expect(result.undo).toBeNull();
    expect(result.data.id).toBe(a.id);
  });

  it('goes to the top level when the parent was moved so deep that it would not fit', async () => {
    const a = await make(alice(), 'A');
    const b = await make(alice(), 'B', a.id);
    const c = await make(alice(), 'C', b.id); // depth 3
    await run(alice(), 'noteFolders.delete', { id: c.id });
    const x = await make(alice(), 'X');
    const y = await make(alice(), 'Y', x.id);
    await run(alice(), 'noteFolders.update', { id: b.id, parentId: y.id }); // B now at depth 3
    const restored = await run(alice(), 'noteFolders.restore', { id: c.id });
    expect(restored.data.parentId).toBeNull();
  });
});
