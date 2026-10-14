import { links, notes } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { Note, NoteLinks } from '@personal-os/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope, type UserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';
import { rewriteNoteLinks } from './note-links';

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
    sql`truncate table notes, note_folders, entity_tags, tags, links, tasks, entities, auth.users cascade`,
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
const create = async (ctx: ActionContext, title: string, contentMd = '') =>
  (await run<Note>(ctx, 'notes.create', { title, contentMd })).data;
const get = async (ctx: ActionContext, id: string) =>
  (await run<Note>(ctx, 'notes.get', { id })).data;
const save = async (ctx: ActionContext, id: string, contentMd: string) => {
  const current = await get(ctx, id);
  return (await run<Note>(ctx, 'notes.update', { id, baseRevision: current.revision, contentMd }))
    .data;
};
const linksOf = async (ctx: ActionContext, id: string) =>
  (await run<NoteLinks>(ctx, 'notes.links', { id })).data;
/** Titles of the live notes this note has a stored `mentions` link to. */
const targetTitles = async (sourceId: string) => {
  const rows = await t.db
    .select({ title: notes.title })
    .from(links)
    .innerJoin(notes, eq(notes.id, links.targetId))
    .where(and(eq(links.sourceId, sourceId), isNull(links.deletedAt)));
  return rows.map((row) => row.title).sort();
};
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return { status: error.statusCode, code: error.code };
    throw error;
  }
  return { status: 0, code: '' };
};

describe('links after each save', () => {
  it('equal the resolved wikilinks of the text, adding and removing as the text changes', async () => {
    await create(alice(), 'Alpha');
    await create(alice(), 'Beta');
    const source = await create(alice(), 'Source');
    await save(alice(), source.id, 'See [[Alpha]] and [[beta|the b]] and [[Missing]]');
    expect(await targetTitles(source.id)).toEqual(['Alpha', 'Beta']);
    await save(alice(), source.id, 'Only [[Beta#Part]]');
    expect(await targetTitles(source.id)).toEqual(['Beta']);
    await save(alice(), source.id, 'Back to [[Alpha]]');
    expect(await targetTitles(source.id)).toEqual(['Alpha']);
    // The removed link is soft-deleted, not hard-deleted
    const all = await t.db.select().from(links).where(eq(links.sourceId, source.id));
    expect(all.length).toBe(3);
  });

  it('ignores links inside code blocks and inline code', async () => {
    await create(alice(), 'Alpha');
    const source = await create(alice(), 'Source');
    await save(alice(), source.id, '```\n[[Alpha]]\n```\n\nand `[[Alpha]]` here');
    expect(await targetTitles(source.id)).toEqual([]);
  });

  it('skips links to the note itself', async () => {
    const note = await create(alice(), 'Loop');
    await save(alice(), note.id, 'I link to [[Loop]]');
    expect(await targetTitles(note.id)).toEqual([]);
  });

  it('is done by notes.create when the text already has links', async () => {
    await create(alice(), 'Alpha');
    const source = await create(alice(), 'Source', 'See [[Alpha]]');
    expect(await targetTitles(source.id)).toEqual(['Alpha']);
  });

  it('never links to another user’s note', async () => {
    await create(bob(), 'Secret');
    const source = await create(alice(), 'Source', 'See [[Secret]]');
    expect(await targetTitles(source.id)).toEqual([]);
    expect((await linksOf(alice(), source.id)).outgoing).toEqual([
      { target: 'Secret', noteId: null },
    ]);
  });
});

describe('late and disappearing targets', () => {
  it('a new note picks up earlier unresolved links', async () => {
    const source = await create(alice(), 'Source', 'Waiting for [[Later]]');
    expect(await targetTitles(source.id)).toEqual([]);
    const later = await create(alice(), 'Later');
    expect(await targetTitles(source.id)).toEqual(['Later']);
    expect((await linksOf(alice(), later.id)).backlinks.map((b) => b.noteId)).toEqual([source.id]);
  });

  it('trashing a target makes links unresolved and restoring re-resolves them', async () => {
    const target = await create(alice(), 'Target');
    const source = await create(alice(), 'Source', 'See [[Target]]');
    expect(await targetTitles(source.id)).toEqual(['Target']);
    await run(alice(), 'notes.delete', { id: target.id });
    expect(await targetTitles(source.id)).toEqual([]);
    expect((await linksOf(alice(), source.id)).outgoing).toEqual([
      { target: 'Target', noteId: null },
    ]);
    await run(alice(), 'notes.restore', { id: target.id });
    expect(await targetTitles(source.id)).toEqual(['Target']);
  });

  it('a restored note picks up links to notes created while it was in the trash', async () => {
    const note = await create(alice(), 'Old', 'Points to [[New]]');
    await run(alice(), 'notes.delete', { id: note.id });
    await create(alice(), 'New');
    await run(alice(), 'notes.restore', { id: note.id });
    expect(await targetTitles(note.id)).toEqual(['New']);
  });
});

describe('rename', () => {
  it('rewrites plain, alias and heading links ignoring case, leaves code alone, and undo restores', async () => {
    const target = await create(alice(), 'Old name');
    const text =
      'A [[Old name]], B [[old NAME|shown]], C [[Old name#Part]], `[[Old name]]`, [[Other]]';
    const source = await create(alice(), 'Source', text);
    const result = await run<Note & { updatedNoteIds: string[] }>(alice(), 'notes.rename', {
      id: target.id,
      title: 'New name',
    });
    expect(result.data.updatedNoteIds).toEqual([source.id]);
    const after = await get(alice(), source.id);
    expect(after.contentMd).toBe(
      'A [[New name]], B [[New name|shown]], C [[New name#Part]], `[[Old name]]`, [[Other]]',
    );
    expect(after.revision).toBe(2);
    const [row] = await t.db.select().from(notes).where(eq(notes.id, source.id));
    expect(row?.contentText).toContain('New name');
    expect(await targetTitles(source.id)).toEqual(['New name']);
    expect((await linksOf(alice(), target.id)).backlinks.map((b) => b.noteId)).toEqual([source.id]);

    const undo = result.undo;
    if (!undo) throw new Error('Expected an undo');
    const undone = await run<Note & { updatedNoteIds: string[] }>(alice(), undo.action, undo.input);
    expect(undone.data.updatedNoteIds).toEqual([source.id]);
    expect((await get(alice(), source.id)).contentMd).toBe(
      'A [[Old name]], B [[Old name|shown]], C [[Old name#Part]], `[[Old name]]`, [[Other]]',
    );
    expect(await targetTitles(source.id)).toEqual(['Old name']);
  });

  it('finds notes by their text when they have no stored link, and re-resolves a waiting [[new title]]', async () => {
    const target = await create(alice(), 'Old name');
    const waiting = await create(alice(), 'Waiting', 'Needs [[Fresh]]');
    expect(await targetTitles(waiting.id)).toEqual([]);
    const result = await run<Note & { updatedNoteIds: string[] }>(alice(), 'notes.rename', {
      id: target.id,
      title: 'Fresh',
    });
    expect(result.data.updatedNoteIds).toEqual([]);
    expect(await targetTitles(waiting.id)).toEqual(['Fresh']);
  });

  it('rewrites trashed notes without reporting them, so a restored note is consistent; never other users’ notes', async () => {
    const target = await create(alice(), 'Old name');
    const trashed = await create(alice(), 'Trashed', 'See [[Old name]]');
    await run(alice(), 'notes.delete', { id: trashed.id });
    const theirs = await create(bob(), 'Theirs', 'See [[Old name]]');
    const result = await run<Note & { updatedNoteIds: string[] }>(alice(), 'notes.rename', {
      id: target.id,
      title: 'New name',
    });
    expect(result.data.updatedNoteIds).toEqual([]);
    expect((await get(bob(), theirs.id)).contentMd).toBe('See [[Old name]]');
    await run(alice(), 'notes.restore', { id: trashed.id });
    expect((await get(alice(), trashed.id)).contentMd).toBe('See [[New name]]');
    expect(await targetTitles(trashed.id)).toEqual(['New name']);
  });

  it('finds and rewrites links written with spaces inside the brackets', async () => {
    const target = await create(alice(), 'Old name');
    const source = await create(alice(), 'Source', 'See [[ Old name ]] here');
    expect(await targetTitles(source.id)).toEqual(['Old name']);
    const result = await run<Note & { updatedNoteIds: string[] }>(alice(), 'notes.rename', {
      id: target.id,
      title: 'New name',
    });
    expect(result.data.updatedNoteIds).toEqual([source.id]);
    expect((await get(alice(), source.id)).contentMd).toBe('See [[New name]] here');
  });

  it('leaves notes that only look similar untouched (no new revision)', async () => {
    const target = await create(alice(), 'Old name');
    const similar = await create(alice(), 'Similar', 'See [[Old name extra]]');
    const unrelated = await create(alice(), 'Unrelated', 'Plain text with Old name in it');
    await run(alice(), 'notes.rename', { id: target.id, title: 'New name' });
    expect((await get(alice(), similar.id)).revision).toBe(1);
    expect((await get(alice(), unrelated.id)).revision).toBe(1);
  });
});

describe('rewriteNoteLinks with a concurrent save', () => {
  it('re-reads a note that changed after it was read and keeps the newer text', async () => {
    await create(alice(), 'Old name');
    const source = await create(alice(), 'Source', 'See [[Old name]]');
    const stale = { id: source.id, revision: source.revision, contentMd: source.contentMd };
    await save(alice(), source.id, 'See [[Old name]] plus a newer edit');
    const result = await rewriteNoteLinks(alice().scope, stale, 'Old name', 'New name');
    expect(result).toEqual({
      status: 'rewritten',
      contentMd: 'See [[New name]] plus a newer edit',
    });
    expect((await get(alice(), source.id)).contentMd).toBe('See [[New name]] plus a newer edit');
  });

  it('skips the note instead of overwriting when the retry also misses', async () => {
    await create(alice(), 'Old name');
    const source = await create(alice(), 'Source', 'See [[Old name]]');
    const scope = { ...alice().scope, update: () => Promise.resolve([]) } as unknown as UserScope;
    const result = await rewriteNoteLinks(scope, source, 'Old name', 'New name');
    expect(result).toEqual({ status: 'skipped' });
    expect((await get(alice(), source.id)).contentMd).toBe('See [[Old name]]');
  });

  it('does not write when the fresh text no longer has the link', async () => {
    await create(alice(), 'Old name');
    const source = await create(alice(), 'Source', 'See [[Old name]]');
    const stale = { id: source.id, revision: source.revision, contentMd: source.contentMd };
    await save(alice(), source.id, 'Link removed');
    const result = await rewriteNoteLinks(alice().scope, stale, 'Old name', 'New name');
    expect(result).toEqual({ status: 'unchanged', contentMd: 'Link removed' });
    expect((await get(alice(), source.id)).revision).toBe(2);
  });
});

describe('notes.titles', () => {
  it('lists live notes of the user ordered by title, ignoring case', async () => {
    await create(alice(), 'banana');
    await create(alice(), 'Apple');
    const gone = await create(alice(), 'Cherry');
    await run(alice(), 'notes.delete', { id: gone.id });
    await create(bob(), 'Bobs');
    const { data } = await run<{ id: string; title: string }[]>(alice(), 'notes.titles', {});
    expect(data.map((n) => n.title)).toEqual(['Apple', 'banana']);
    expect(Object.keys(data[0] ?? {}).sort()).toEqual(['id', 'title']);
  });

  it('rejects input that is not an object as a ZodError', async () => {
    await expect(registry.run(alice(), 'notes.titles', 'x')).rejects.toBeInstanceOf(ZodError);
  });
});

describe('notes.links', () => {
  it('gives backlinks with a context line and outgoing links with ids or null', async () => {
    const target = await create(alice(), 'Target');
    const other = await create(alice(), 'Other');
    await create(
      alice(),
      'Zed',
      '# Heading\n\n```\n[[Target]] in code\n```\n\nThe **key** point is [[target|here]] today.\n\nAgain [[Target]]',
    );
    await save(alice(), other.id, 'Mentions [[Target]] and [[Nowhere]] and [[Target]]');
    const result = await linksOf(alice(), target.id);
    expect(result.backlinks).toEqual([
      { noteId: other.id, title: 'Other', context: 'Mentions Target and Nowhere and Target' },
      expect.objectContaining({ title: 'Zed', context: 'The key point is here today.' }),
    ]);
    expect(result.outgoing).toEqual([]);
    expect((await linksOf(alice(), other.id)).outgoing).toEqual([
      { target: 'Target', noteId: target.id },
      { target: 'Nowhere', noteId: null },
    ]);
  });

  it('cuts the context to 160 characters', async () => {
    const target = await create(alice(), 'Target');
    await create(alice(), 'Long', `[[Target]] ${'word '.repeat(80)}`);
    const [back] = (await linksOf(alice(), target.id)).backlinks;
    expect(back?.context.length).toBeLessThanOrEqual(160);
    expect(back?.context.endsWith('…')).toBe(true);
  });

  it('cuts the context to exactly 160 characters including the ellipsis', async () => {
    const target = await create(alice(), 'Target');
    await create(alice(), 'Long', `[[Target]] ${'a'.repeat(400)}`);
    const [back] = (await linksOf(alice(), target.id)).backlinks;
    expect(back?.context.length).toBe(160);
    expect(back?.context.endsWith('…')).toBe(true);
  });

  it('keeps a context of exactly 160 characters whole', async () => {
    const target = await create(alice(), 'Target');
    await create(alice(), 'Exact', `[[Target]]${'a'.repeat(160 - 'Target'.length)}`);
    const [back] = (await linksOf(alice(), target.id)).backlinks;
    expect(back?.context.length).toBe(160);
    expect(back?.context.endsWith('…')).toBe(false);
  });

  it('leaves out trashed sources', async () => {
    const target = await create(alice(), 'Target');
    const source = await create(alice(), 'Source', 'See [[Target]]');
    expect((await linksOf(alice(), target.id)).backlinks).toHaveLength(1);
    await run(alice(), 'notes.delete', { id: source.id });
    expect((await linksOf(alice(), target.id)).backlinks).toEqual([]);
  });

  it('answers 404 for another user’s note, a missing note and a trashed note', async () => {
    const theirs = await create(bob(), 'Theirs');
    const trashed = await create(alice(), 'Trashed');
    await run(alice(), 'notes.delete', { id: trashed.id });
    for (const id of [theirs.id, MISSING, trashed.id]) {
      expect(await failure(registry.run(alice(), 'notes.links', { id }))).toEqual({
        status: 404,
        code: 'not_found',
      });
    }
  });

  it('rejects a bad id as a ZodError and keeps two users apart', async () => {
    await expect(registry.run(alice(), 'notes.links', { id: 'nope' })).rejects.toBeInstanceOf(
      ZodError,
    );
    const mine = await create(alice(), 'Same', '[[Same2]]');
    const theirs = await create(bob(), 'Same2');
    await create(alice(), 'Same2');
    expect((await linksOf(bob(), theirs.id)).backlinks).toEqual([]);
    expect(await targetTitles(mine.id)).toEqual(['Same2']);
  });
});
