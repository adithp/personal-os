import { noteVersions } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { Note, NoteVersion, NoteVersionSummary } from '@personal-os/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T06:00:00.000Z'));
  await t.db.execute(
    sql`truncate table notes, note_versions, note_folders, entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
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
const run = async <T>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const create = async (ctx: ActionContext, title: string, contentMd = '') =>
  (await run<Note>(ctx, 'notes.create', { title, contentMd })).data;
const get = async (ctx: ActionContext, id: string) =>
  (await run<Note>(ctx, 'notes.get', { id })).data;
const save = async (ctx: ActionContext, id: string, contentMd: string, force = false) => {
  const current = await get(ctx, id);
  return (
    await run<Note>(ctx, 'notes.update', {
      id,
      baseRevision: current.revision,
      contentMd,
      ...(force ? { force: true } : {}),
    })
  ).data;
};
const versions = async (ctx: ActionContext, id: string) =>
  (await run<NoteVersionSummary[]>(ctx, 'notes.versions', { id })).data;
const minutes = (n: number) => vi.setSystemTime(Date.now() + n * 60_000);
const expectStatus = async (promise: Promise<unknown>, status: number) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).statusCode).toBe(status);
};

describe('version snapshots', () => {
  it('stores the text as it was before the first save, then waits 10 minutes', async () => {
    const note = await create(alice(), 'A', 'one');
    await save(alice(), note.id, 'two');
    const first = await versions(alice(), note.id);
    expect(first).toHaveLength(1);
    expect(first[0]?.reason).toBe('auto');

    minutes(9);
    await save(alice(), note.id, 'three');
    expect(await versions(alice(), note.id)).toHaveLength(1);

    minutes(2);
    await save(alice(), note.id, 'four');
    const list = await versions(alice(), note.id);
    expect(list).toHaveLength(2);
    const newest = await run<NoteVersion>(alice(), 'notes.getVersion', {
      id: note.id,
      versionId: list[0]?.id,
    });
    expect(newest.data.contentMd).toBe('three');
    const oldest = await run<NoteVersion>(alice(), 'notes.getVersion', {
      id: note.id,
      versionId: list[1]?.id,
    });
    expect(oldest.data).toMatchObject({ contentMd: 'one', title: 'A' });
  });

  it('stores nothing when the text before the save is empty', async () => {
    const empty = await create(alice(), 'Empty');
    await save(alice(), empty.id, 'first words');
    expect(await versions(alice(), empty.id)).toHaveLength(0);
  });

  it('does not store a version for a save that changes no text', async () => {
    const note = await create(alice(), 'C', 'one');
    const current = await get(alice(), note.id);
    await run(alice(), 'notes.update', {
      id: note.id,
      baseRevision: current.revision,
      pinned: true,
    });
    await run(alice(), 'notes.update', {
      id: note.id,
      baseRevision: current.revision,
      contentMd: 'one',
    });
    expect(await versions(alice(), note.id)).toHaveLength(0);
  });

  it('stores a conflict version at once, even inside the 10 minutes', async () => {
    const note = await create(alice(), 'D', 'one');
    await save(alice(), note.id, 'two');
    await save(alice(), note.id, 'theirs', true);
    const list = await versions(alice(), note.id);
    expect(list.map((v) => v.reason)).toEqual(['conflict', 'auto']);
    const conflict = await run<NoteVersion>(alice(), 'notes.getVersion', {
      id: note.id,
      versionId: list[0]?.id,
    });
    expect(conflict.data.contentMd).toBe('two');
  });

  it('keeps only the newest 50 versions of a note', async () => {
    const note = await create(alice(), 'E', 'v0');
    for (let n = 1; n <= 55; n += 1) {
      minutes(11);
      await save(alice(), note.id, `v${String(n)}`);
    }
    const list = await versions(alice(), note.id);
    expect(list).toHaveLength(50);
    const newest = await run<NoteVersion>(alice(), 'notes.getVersion', {
      id: note.id,
      versionId: list[0]?.id,
    });
    expect(newest.data.contentMd).toBe('v54');
    const oldest = await run<NoteVersion>(alice(), 'notes.getVersion', {
      id: note.id,
      versionId: list[49]?.id,
    });
    expect(oldest.data.contentMd).toBe('v5');
  });
});

describe('notes.versions and notes.getVersion', () => {
  it('lists newest first with words and the change against the next older version', async () => {
    const note = await create(alice(), 'F', 'one two');
    await save(alice(), note.id, 'one two three four five');
    minutes(11);
    await save(alice(), note.id, 'one');
    minutes(11);
    await save(alice(), note.id, 'x');
    const list = await versions(alice(), note.id);
    expect(list.map((v) => [v.words, v.wordsDelta])).toEqual([
      [1, -4],
      [5, 3],
      [2, 2],
    ]);
  });

  it('reads the versions of a trashed note, and 404s for another user, a missing note or version', async () => {
    const note = await create(alice(), 'G', 'a');
    await save(alice(), note.id, 'b');
    const [version] = await versions(alice(), note.id);
    await run(alice(), 'notes.delete', { id: note.id });
    expect(await versions(alice(), note.id)).toHaveLength(1);

    await expectStatus(registry.run(bob(), 'notes.versions', { id: note.id }), 404);
    await expectStatus(
      registry.run(bob(), 'notes.getVersion', { id: note.id, versionId: version?.id }),
      404,
    );
    await expectStatus(registry.run(alice(), 'notes.versions', { id: MISSING }), 404);
    await expectStatus(
      registry.run(alice(), 'notes.getVersion', { id: note.id, versionId: MISSING }),
      404,
    );
  });

  it('404s for a version that belongs to another note', async () => {
    const one = await create(alice(), 'H1', 'a');
    const two = await create(alice(), 'H2', 'a');
    await save(alice(), one.id, 'b');
    const [version] = await versions(alice(), one.id);
    await expectStatus(
      registry.run(alice(), 'notes.getVersion', { id: two.id, versionId: version?.id }),
      404,
    );
    await expectStatus(
      registry.run(alice(), 'notes.restoreVersion', { id: two.id, versionId: version?.id }),
      404,
    );
  });

  it('rejects bad input', async () => {
    await expect(registry.run(alice(), 'notes.versions', { id: 'x' })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(registry.run(alice(), 'notes.getVersion', { id: MISSING })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      registry.run(alice(), 'notes.restoreVersion', { id: MISSING, versionId: 'x' }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe('notes.restoreVersion', () => {
  it('puts the text back, keeps the title, bumps the revision and rebuilds links and tags', async () => {
    const target = await create(alice(), 'Target', '');
    const note = await create(alice(), 'Doc', 'old [[Target]] #old');
    await save(alice(), note.id, 'new text #new');
    const [version] = await versions(alice(), note.id);
    const before = await get(alice(), note.id);

    const restored = await run<Note>(alice(), 'notes.restoreVersion', {
      id: note.id,
      versionId: version?.id,
    });
    expect(restored.data).toMatchObject({
      title: 'Doc',
      contentMd: 'old [[Target]] #old',
      revision: before.revision + 1,
    });
    expect(restored.data.excerpt).toContain('old');
    const links = await run<{ backlinks: unknown[] }>(alice(), 'notes.links', { id: target.id });
    expect(links.data.backlinks).toHaveLength(1);
    const list = await versions(alice(), note.id);
    expect(list[0]?.reason).toBe('before_restore');
  });

  it('is undone by restoring the before_restore version', async () => {
    const note = await create(alice(), 'U', 'one');
    await save(alice(), note.id, 'two');
    const [version] = await versions(alice(), note.id);
    const restored = await run<Note>(alice(), 'notes.restoreVersion', {
      id: note.id,
      versionId: version?.id,
    });
    expect(restored.data.contentMd).toBe('one');
    expect(restored.undo?.action).toBe('notes.restoreVersion');

    const undone = await run<Note>(alice(), restored.undo?.action ?? '', restored.undo?.input);
    expect(undone.data.contentMd).toBe('two');
    expect(undone.data.revision).toBe(restored.data.revision + 1);
  });

  it('stores before_restore inside the 10 minutes, and reuses the newest when the text is equal', async () => {
    const note = await create(alice(), 'W', 'one');
    await save(alice(), note.id, 'two');
    const [version] = await versions(alice(), note.id);
    await run(alice(), 'notes.restoreVersion', { id: note.id, versionId: version?.id });
    expect(await versions(alice(), note.id)).toHaveLength(2);
    // Current text is "one", the newest version is "two": restoring "one" again stores "one"
    // as a new version; restoring it a second time finds it equal and adds nothing
    minutes(1);
    const second = await run<Note>(alice(), 'notes.restoreVersion', {
      id: note.id,
      versionId: version?.id,
    });
    const afterSecond = await versions(alice(), note.id);
    expect(afterSecond).toHaveLength(3);
    minutes(1);
    const third = await run(alice(), 'notes.restoreVersion', {
      id: note.id,
      versionId: version?.id,
    });
    expect(await versions(alice(), note.id)).toHaveLength(3);
    expect(third.undo?.input.versionId).toBe(afterSecond[0]?.id);
    expect(second.data.contentMd).toBe('one');
  });

  it('stores an empty current text for undo', async () => {
    const note = await create(alice(), 'Z', 'one');
    await save(alice(), note.id, '');
    const [version] = await versions(alice(), note.id);
    const restored = await run<Note>(alice(), 'notes.restoreVersion', {
      id: note.id,
      versionId: version?.id,
    });
    const undone = await run<Note>(alice(), restored.undo?.action ?? '', restored.undo?.input);
    expect(undone.data.contentMd).toBe('');
  });

  it('works only for live notes', async () => {
    const note = await create(alice(), 'T', 'a');
    await save(alice(), note.id, 'b');
    const [version] = await versions(alice(), note.id);
    await run(alice(), 'notes.delete', { id: note.id });
    await expectStatus(
      registry.run(alice(), 'notes.restoreVersion', { id: note.id, versionId: version?.id }),
      404,
    );
  });

  it("cannot restore another user's version", async () => {
    const note = await create(alice(), 'P', 'a');
    await save(alice(), note.id, 'b');
    const [version] = await versions(alice(), note.id);
    await expectStatus(
      registry.run(bob(), 'notes.restoreVersion', { id: note.id, versionId: version?.id }),
      404,
    );
    expect((await get(alice(), note.id)).contentMd).toBe('b');
  });
});

describe('versions and purge', () => {
  it('go with the note when it is purged, and stay separate per user', async () => {
    const mine = await create(alice(), 'Mine', 'a');
    const theirs = await create(bob(), 'Theirs', 'a');
    await save(alice(), mine.id, 'b');
    await save(bob(), theirs.id, 'b');
    expect(await t.db.select().from(noteVersions)).toHaveLength(2);

    await run(alice(), 'notes.delete', { id: mine.id });
    await run(alice(), 'notes.purge', { id: mine.id });
    const left = await t.db.select().from(noteVersions);
    expect(left.map((row) => row.noteId)).toEqual([theirs.id]);
    expect(await t.db.select().from(noteVersions).where(eq(noteVersions.userId, ALICE))).toEqual(
      [],
    );
    expect(await versions(bob(), theirs.id)).toHaveLength(1);
  });
});
