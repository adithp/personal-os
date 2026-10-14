import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { NoteTemplate } from '@personal-os/shared';
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
  await t.db.execute(sql`truncate table notes, note_templates, entities, auth.users cascade`);
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

interface Result<T> {
  data: T;
  undo?: { action: string; input: Record<string, unknown> } | null;
}
const run = async <T = NoteTemplate>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const make = async (ctx: ActionContext, name: string, extra: Record<string, unknown> = {}) =>
  (await run(ctx, 'noteTemplates.create', { name, ...extra })).data;
const list = async (ctx: ActionContext) =>
  (await run<NoteTemplate[]>(ctx, 'noteTemplates.list', {})).data;
const defaults = async (ctx: ActionContext) =>
  (await list(ctx)).filter((item) => item.isDailyDefault).map((item) => item.name);
const status = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    if (error instanceof HttpError) return `${String(error.statusCode)} ${error.code}`;
    throw error;
  }
};

describe('noteTemplates.create and list', () => {
  it('creates a template and lists templates by name ignoring case', async () => {
    await make(alice(), 'meeting', { contentMd: '# {{title}}' });
    await make(alice(), 'Book');
    await make(alice(), 'Agenda');
    expect((await list(alice())).map((item) => item.name)).toEqual(['Agenda', 'Book', 'meeting']);
    expect((await list(alice()))[2]?.contentMd).toBe('# {{title}}');
  });

  it('refuses a name used by a live template, ignoring case', async () => {
    await make(alice(), 'Meeting');
    expect(await status(run(alice(), 'noteTemplates.create', { name: 'MEETING' }))).toBe(
      '409 template_name_taken',
    );
  });

  it('lets two users use the same name', async () => {
    await make(alice(), 'Meeting');
    await make(bob(), 'Meeting');
    expect(await list(bob())).toHaveLength(1);
  });

  it('rejects bad input', async () => {
    await expect(run(alice(), 'noteTemplates.create', { name: '  ' })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      run(alice(), 'noteTemplates.create', { name: 'x'.repeat(81) }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      run(alice(), 'noteTemplates.create', { name: 'x', contentMd: 'a'.repeat(200001) }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('undo of a create deletes the template', async () => {
    const created = await run(alice(), 'noteTemplates.create', { name: 'A' });
    const undo = created.undo;
    expect(undo?.action).toBe('noteTemplates.delete');
    await run(alice(), undo?.action ?? '', undo?.input);
    expect(await list(alice())).toHaveLength(0);
  });
});

describe('daily default flag', () => {
  it('moves the flag when another template is marked', async () => {
    await make(alice(), 'A', { isDailyDefault: true });
    await make(alice(), 'B', { isDailyDefault: true });
    expect(await defaults(alice())).toEqual(['B']);
    const a = (await list(alice())).find((item) => item.name === 'A');
    await run(alice(), 'noteTemplates.update', { id: a?.id, isDailyDefault: true });
    expect(await defaults(alice())).toEqual(['A']);
  });

  it('does not touch the templates of another user', async () => {
    await make(bob(), 'B', { isDailyDefault: true });
    await make(alice(), 'A', { isDailyDefault: true });
    expect(await defaults(bob())).toEqual(['B']);
  });

  it('can be switched off', async () => {
    const a = await make(alice(), 'A', { isDailyDefault: true });
    const result = await run(alice(), 'noteTemplates.update', { id: a.id, isDailyDefault: false });
    expect(result.data.isDailyDefault).toBe(false);
    expect(await defaults(alice())).toEqual([]);
  });
});

describe('noteTemplates.update', () => {
  it('changes name and text, and undo puts them back', async () => {
    const a = await make(alice(), 'A', { contentMd: 'one' });
    const result = await run(alice(), 'noteTemplates.update', {
      id: a.id,
      name: 'Renamed',
      contentMd: 'two',
    });
    expect(result.data).toMatchObject({ name: 'Renamed', contentMd: 'two' });
    await run(alice(), result.undo?.action ?? '', result.undo?.input);
    expect((await list(alice()))[0]).toMatchObject({ name: 'A', contentMd: 'one' });
  });

  it('keeping the same name is fine and changes nothing', async () => {
    const a = await make(alice(), 'A');
    const result = await run(alice(), 'noteTemplates.update', { id: a.id, name: 'A' });
    expect(result.undo).toBeNull();
  });

  it('refuses a name used by another template', async () => {
    await make(alice(), 'A');
    const b = await make(alice(), 'B');
    expect(await status(run(alice(), 'noteTemplates.update', { id: b.id, name: 'a' }))).toBe(
      '409 template_name_taken',
    );
  });

  it('rejects an empty change and a bad id', async () => {
    const a = await make(alice(), 'A');
    await expect(run(alice(), 'noteTemplates.update', { id: a.id })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      run(alice(), 'noteTemplates.update', { id: 'nope', name: 'x' }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('answers 404 for a missing, deleted or foreign template', async () => {
    const a = await make(alice(), 'A');
    expect(await status(run(bob(), 'noteTemplates.update', { id: a.id, name: 'X' }))).toBe(
      '404 not_found',
    );
    expect(await status(run(alice(), 'noteTemplates.update', { id: MISSING, name: 'X' }))).toBe(
      '404 not_found',
    );
    await run(alice(), 'noteTemplates.delete', { id: a.id });
    expect(await status(run(alice(), 'noteTemplates.update', { id: a.id, name: 'X' }))).toBe(
      '404 not_found',
    );
  });
});

describe('noteTemplates.delete and restore', () => {
  it('soft deletes, and undo restores with the flag', async () => {
    const a = await make(alice(), 'A', { isDailyDefault: true });
    const deleted = await run(alice(), 'noteTemplates.delete', { id: a.id });
    expect(await list(alice())).toHaveLength(0);
    const restored = await run(alice(), deleted.undo?.action ?? '', deleted.undo?.input);
    expect(restored.data).toMatchObject({ name: 'A', isDailyDefault: true });
    expect(restored.undo?.action).toBe('noteTemplates.delete');
  });

  it('restores as a normal template when another one is the daily default now', async () => {
    const a = await make(alice(), 'A', { isDailyDefault: true });
    await run(alice(), 'noteTemplates.delete', { id: a.id });
    await make(alice(), 'B', { isDailyDefault: true });
    const restored = await run(alice(), 'noteTemplates.restore', { id: a.id });
    expect(restored.data.isDailyDefault).toBe(false);
    expect(await defaults(alice())).toEqual(['B']);
  });

  it('adds (2) to the name when it was taken meanwhile', async () => {
    const a = await make(alice(), 'Notes');
    await run(alice(), 'noteTemplates.delete', { id: a.id });
    await make(alice(), 'notes');
    const first = await run(alice(), 'noteTemplates.restore', { id: a.id });
    expect(first.data.name).toBe('Notes (2)');
  });

  it('restoring a live template changes nothing', async () => {
    const a = await make(alice(), 'A');
    const result = await run(alice(), 'noteTemplates.restore', { id: a.id });
    expect(result.undo).toBeNull();
  });

  it('deleting twice is a 404, and another user cannot delete or restore', async () => {
    const a = await make(alice(), 'A');
    expect(await status(run(bob(), 'noteTemplates.delete', { id: a.id }))).toBe('404 not_found');
    await run(alice(), 'noteTemplates.delete', { id: a.id });
    expect(await status(run(alice(), 'noteTemplates.delete', { id: a.id }))).toBe('404 not_found');
    expect(await status(run(bob(), 'noteTemplates.restore', { id: a.id }))).toBe('404 not_found');
    expect(await list(alice())).toHaveLength(0);
  });
});
