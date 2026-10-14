import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { Note } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  await t.db.execute(sql`truncate table notes, note_templates, entities, auth.users cascade`);
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});
afterEach(() => {
  vi.useRealTimers();
});

interface Result<T> {
  data: T;
  undo?: { action: string; input: Record<string, unknown> } | null;
}
const run = async <T = Note>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const open = (ctx: ActionContext, date?: string) =>
  run(ctx, 'notes.openDaily', date ? { date } : {});
const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

describe('notes.openDaily', () => {
  it('creates the note of the given day with the date as title, outside any folder', async () => {
    const result = await open(alice(), '2026-10-14');
    expect(result.data).toMatchObject({
      title: '2026-10-14',
      dailyDate: '2026-10-14',
      folderId: null,
      contentMd: '',
      revision: 1,
    });
    expect(result.undo?.action).toBe('notes.delete');
  });

  it('returns the same note the second time, with no undo', async () => {
    const first = await open(alice(), '2026-10-14');
    const second = await open(alice(), '2026-10-14');
    expect(second.data.id).toBe(first.data.id);
    expect(second.undo).toBeNull();
  });

  it('uses the India day for today, also just before and after midnight', async () => {
    at('2026-10-14T18:29:00.000Z');
    expect((await open(alice())).data.dailyDate).toBe('2026-10-14');
    at('2026-10-14T18:31:00.000Z');
    expect((await open(alice())).data.dailyDate).toBe('2026-10-15');
  });

  it('undo of a create moves the note to the trash, and the day can be opened again', async () => {
    const first = await open(alice(), '2026-10-14');
    await run(alice(), first.undo?.action ?? '', first.undo?.input);
    const again = await open(alice(), '2026-10-14');
    expect(again.data.id).not.toBe(first.data.id);
    expect(again.undo).not.toBeNull();
  });

  it('fills the daily default template with title, date and time in India time', async () => {
    await run(alice(), 'noteTemplates.create', {
      name: 'Other',
      contentMd: 'not this one',
    });
    await run(alice(), 'noteTemplates.create', {
      name: 'Daily',
      contentMd: '# {{title}}\n{{date}} {{time}} #daily [[Plan]]',
      isDailyDefault: true,
    });
    at('2026-10-14T18:31:00.000Z');
    const result = await open(alice(), '2026-10-15');
    expect(result.data.contentMd).toBe('# 2026-10-15\n2026-10-15 00:01 #daily [[Plan]]');
    expect(result.data.excerpt).toContain('2026-10-15');
  });

  it('ignores a deleted daily template', async () => {
    const template = await run<{ id: string }>(alice(), 'noteTemplates.create', {
      name: 'Daily',
      contentMd: 'text',
      isDailyDefault: true,
    });
    await run(alice(), 'noteTemplates.delete', { id: template.data.id });
    expect((await open(alice(), '2026-10-14')).data.contentMd).toBe('');
  });

  it('adds (daily) to the title when a normal note has the date as title', async () => {
    await run(alice(), 'notes.create', { title: '2026-10-14' });
    const result = await open(alice(), '2026-10-14');
    expect(result.data.title).toBe('2026-10-14 (daily)');
    expect(result.data.dailyDate).toBe('2026-10-14');
  });

  it('a title clash is found ignoring case, and a second clash gets a number', async () => {
    await run(alice(), 'notes.create', { title: '2026-10-14' });
    await run(alice(), 'notes.create', { title: '2026-10-14 (DAILY)' });
    expect((await open(alice(), '2026-10-14')).data.title).toBe('2026-10-14 (daily 2)');
  });

  it('two parallel calls return the same note', async () => {
    const results = await Promise.all([
      open(alice(), '2026-10-14'),
      open(alice(), '2026-10-14'),
      open(alice(), '2026-10-14'),
    ]);
    expect(new Set(results.map((result) => result.data.id)).size).toBe(1);
    expect(results.filter((result) => result.undo !== null)).toHaveLength(1);
    const count = await t.db.execute(sql`select count(*)::int as n from notes`);
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  it('keeps users apart', async () => {
    await run(alice(), 'noteTemplates.create', {
      name: 'Daily',
      contentMd: 'alice only',
      isDailyDefault: true,
    });
    const a = await open(alice(), '2026-10-14');
    const b = await open(bob(), '2026-10-14');
    expect(b.data.id).not.toBe(a.data.id);
    expect(b.data.contentMd).toBe('');
  });

  it('rejects a bad or impossible date', async () => {
    await expect(open(alice(), '14-10-2026')).rejects.toBeInstanceOf(ZodError);
    await expect(open(alice(), '2026-02-30')).rejects.toBeInstanceOf(ZodError);
  });
});

describe('notes.openDaily dates and restore', () => {
  it('fills {{date}} with the day of the note and {{time}} with the current time', async () => {
    await run(alice(), 'noteTemplates.create', {
      name: 'Daily',
      contentMd: '{{date}} {{time}}',
      isDailyDefault: true,
    });
    at('2026-10-14T06:30:00.000Z');
    const result = await open(alice(), '2026-12-25');
    expect(result.data.contentMd).toBe('2026-12-25 12:00');
  });

  it('restoring a daily note whose day is used by another live daily note keeps it as a normal note', async () => {
    const first = await open(alice(), '2026-10-14');
    await run(alice(), 'notes.delete', { id: first.data.id });
    const second = await open(alice(), '2026-10-14');
    expect(second.data.id).not.toBe(first.data.id);
    const restored = await run(alice(), 'notes.restore', { id: first.data.id });
    expect(restored.data.dailyDate).toBeNull();
    expect(restored.data.deletedAt).toBeNull();
    expect(restored.data.title).toBe('2026-10-14 (2)');
    expect((await open(alice(), '2026-10-14')).data.id).toBe(second.data.id);
  });

  it('restoring a daily note whose day is free keeps its day', async () => {
    const first = await open(alice(), '2026-10-14');
    await run(alice(), 'notes.delete', { id: first.data.id });
    expect((await run(alice(), 'notes.restore', { id: first.data.id })).data.dailyDate).toBe(
      '2026-10-14',
    );
  });
});
