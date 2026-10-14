import { entityTags, noteTemplates, notes, tags } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type { Note, NoteSummary, Tag } from '@personal-os/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const create = async (ctx: ActionContext, title: string, contentMd = '') =>
  (await run<Note>(ctx, 'notes.create', { title, contentMd })).data;
const get = async (ctx: ActionContext, id: string) =>
  (await run<Note>(ctx, 'notes.get', { id })).data;
const save = async (ctx: ActionContext, id: string, contentMd: string) => {
  const current = await get(ctx, id);
  return (await run<Note>(ctx, 'notes.update', { id, baseRevision: current.revision, contentMd }))
    .data;
};
const tagList = async (ctx: ActionContext) => (await run<Tag[]>(ctx, 'tags.list', {})).data;
/** Names of the tags stored on a note (entity_tags), sorted. */
const storedTags = async (noteId: string) => {
  const rows = await t.db
    .select({ name: tags.name })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .where(eq(entityTags.entityId, noteId));
  return rows.map((row) => row.name).sort();
};
const tagId = async (ctx: ActionContext, name: string) => {
  const found = (await tagList(ctx)).find((tag) => tag.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`no tag ${name}`);
  return found.id;
};

describe('tags in note text', () => {
  it('stores the tags of the text and keeps them equal after every save', async () => {
    const note = await create(alice(), 'A', 'plan #work and #Home/Chores');
    expect(await storedTags(note.id)).toEqual(['Home/Chores', 'work']);
    await save(alice(), note.id, 'plan #work only');
    expect(await storedTags(note.id)).toEqual(['work']);
    await save(alice(), note.id, 'no tags');
    expect(await storedTags(note.id)).toEqual([]);
    await save(alice(), note.id, '#a #b #a');
    expect(await storedTags(note.id)).toEqual(['a', 'b']);
  });

  it('does not take digits only, code, headings or URL fragments as tags', async () => {
    const note = await create(
      alice(),
      'B',
      [
        '# Heading',
        'issue #1984 and #2024-05-01',
        'see https://example.com/page#section and a#b',
        'inline `#incode` here',
        '```',
        '#fenced',
        '```',
        'real #yes',
      ].join('\n'),
    );
    expect(await storedTags(note.id)).toEqual(['yes']);
  });

  it('reuses an existing tag ignoring case and keeps its spelling', async () => {
    const task = await run<{ id: string }>(alice(), 'tasks.create', {
      title: 'T',
      tagNames: ['Work'],
    });
    expect(task.data.id).toBeTruthy();
    const note = await create(alice(), 'C', 'x #work');
    expect(await storedTags(note.id)).toEqual(['Work']);
    expect(
      (await tagList(alice())).filter((tag) => tag.name.toLowerCase() === 'work'),
    ).toHaveLength(1);
  });

  it('gives a new tag a palette color', async () => {
    await create(alice(), 'D', '#fresh');
    const [tag] = await tagList(alice());
    expect(tag?.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('shows tagNames in notes.get and notes.list', async () => {
    const note = await create(alice(), 'E', '#b #a');
    expect((await get(alice(), note.id)).tagNames).toEqual(['a', 'b']);
    const list = (await run<NoteSummary[]>(alice(), 'notes.list', {})).data;
    expect(list[0]?.tagNames).toEqual(['a', 'b']);
  });

  it('keeps two saves with the same new tag from failing', async () => {
    const one = await create(alice(), 'F1');
    const two = await create(alice(), 'F2');
    await Promise.all([save(alice(), one.id, '#same'), save(alice(), two.id, '#same')]);
    expect(await storedTags(one.id)).toEqual(['same']);
    expect(await storedTags(two.id)).toEqual(['same']);
    expect(await tagList(alice())).toHaveLength(1);
  });
});

describe('tags.list noteCount', () => {
  it('counts live notes only and keeps taskCount for tasks', async () => {
    const a = await create(alice(), 'A', '#x');
    await create(alice(), 'B', '#x');
    await run(alice(), 'tasks.create', { title: 'T', tagNames: ['x'] });
    expect((await tagList(alice()))[0]).toMatchObject({ noteCount: 2, taskCount: 1 });
    await run(alice(), 'notes.delete', { id: a.id });
    expect((await tagList(alice()))[0]).toMatchObject({ noteCount: 1, taskCount: 1 });
  });
});

describe('tag rename and merge rewrite the note text', () => {
  it('rewrites #old to #new, raises the revision, and undo writes it back', async () => {
    const note = await create(alice(), 'R', 'a #old b\n```\n#old\n```\nhttps://x.dev/#old');
    const id = await tagId(alice(), 'old');
    const renamed = await run<Tag>(alice(), 'tags.update', { id, name: 'fresh' });
    const after = await get(alice(), note.id);
    expect(after.contentMd).toBe('a #fresh b\n```\n#old\n```\nhttps://x.dev/#old');
    expect(after.revision).toBe(note.revision + 1);
    expect(await storedTags(note.id)).toEqual(['fresh']);

    expect(renamed.undo).toBeTruthy();
    await run(alice(), renamed.undo?.action ?? '', renamed.undo?.input);
    const back = await get(alice(), note.id);
    expect(back.contentMd).toBe('a #old b\n```\n#old\n```\nhttps://x.dev/#old');
    expect(await storedTags(note.id)).toEqual(['old']);
  });

  it('updates the searchable text of the rewritten note', async () => {
    const note = await create(alice(), 'S', 'word #old');
    await run(alice(), 'tags.update', { id: await tagId(alice(), 'old'), name: 'new' });
    const [row] = await t.db.select().from(notes).where(eq(notes.id, note.id));
    expect(row?.contentText).toContain('#new');
  });

  it('does not touch a color-only change or the notes of another user', async () => {
    const mine = await create(alice(), 'M', '#shared');
    const theirs = await create(bob(), 'M', '#shared');
    await run(alice(), 'tags.update', { id: await tagId(alice(), 'shared'), color: '#112233' });
    expect((await get(alice(), mine.id)).revision).toBe(mine.revision);
    await run(alice(), 'tags.update', { id: await tagId(alice(), 'shared'), name: 'renamed' });
    expect((await get(bob(), theirs.id)).contentMd).toBe('#shared');
    expect(await storedTags(theirs.id)).toEqual(['shared']);
  });

  it('merge moves #source to #target in notes; a note with both keeps one', async () => {
    const one = await create(alice(), 'One', 'x #src');
    const both = await create(alice(), 'Both', '#src and #dst');
    await create(alice(), 'Dst', '#dst');
    const merged = await run<Tag>(alice(), 'tags.merge', {
      sourceId: await tagId(alice(), 'src'),
      targetId: await tagId(alice(), 'dst'),
    });
    expect((await get(alice(), one.id)).contentMd).toBe('x #dst');
    expect((await get(alice(), both.id)).contentMd).toBe('#dst and #dst');
    expect(await storedTags(one.id)).toEqual(['dst']);
    expect(await storedTags(both.id)).toEqual(['dst']);
    expect((await tagList(alice())).map((tag) => tag.name)).toEqual(['dst']);
    expect((await tagList(alice()))[0]?.noteCount).toBe(3);

    // unmerge brings the source tag back (the text stays on the target, as for tasks)
    expect(merged.undo?.action).toBe('tags.unmerge');
    await run(alice(), 'tags.unmerge', merged.undo?.input);
    expect((await tagList(alice())).map((tag) => tag.name).sort()).toEqual(['dst', 'src']);
    expect((await get(alice(), one.id)).contentMd).toBe('x #dst');
  });
});

describe('tags.delete with notes', () => {
  it('is refused with a count while live notes contain the tag', async () => {
    await create(alice(), 'A', '#gone');
    await create(alice(), 'B', '#gone');
    const id = await tagId(alice(), 'gone');
    const error = await run(alice(), 'tags.delete', { id }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'tag_in_notes',
      message: 'Remove #gone from 2 notes first.',
    });
    expect(await tagList(alice())).toHaveLength(1);
  });

  it('uses the singular for one note', async () => {
    await create(alice(), 'A', '#one');
    await expect(
      run(alice(), 'tags.delete', { id: await tagId(alice(), 'one') }),
    ).rejects.toMatchObject({ message: 'Remove #one from 1 note first.' });
  });

  it('works once the note no longer has the tag or is in the trash', async () => {
    const a = await create(alice(), 'A', '#gone');
    const b = await create(alice(), 'B', '#gone');
    const id = await tagId(alice(), 'gone');
    await save(alice(), a.id, 'clean');
    await run(alice(), 'notes.delete', { id: b.id });
    await run(alice(), 'tags.delete', { id });
    expect(await tagList(alice())).toHaveLength(0);
  });

  it('ignores the notes of another user', async () => {
    await create(bob(), 'B', '#mine');
    const task = await run<{ id: string }>(alice(), 'tasks.create', {
      title: 'T',
      tagNames: ['mine'],
    });
    expect(task.data.id).toBeTruthy();
    await run(alice(), 'tags.delete', { id: await tagId(alice(), 'mine') });
    expect(await tagList(bob())).toHaveLength(1);
  });

  it('answers 404 for a missing tag', async () => {
    await expect(run(alice(), 'tags.delete', { id: MISSING })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('notes.list filters', () => {
  it('filters by tagId and only shows the user own notes', async () => {
    const a = await create(alice(), 'A', '#t');
    await create(alice(), 'B', '#other');
    await create(bob(), 'C', '#t');
    const id = await tagId(alice(), 't');
    const list = (await run<NoteSummary[]>(alice(), 'notes.list', { tagId: id })).data;
    expect(list.map((note) => note.id)).toEqual([a.id]);
    expect((await run<NoteSummary[]>(bob(), 'notes.list', { tagId: id })).data).toEqual([]);
  });

  it('rejects a tagId that is not a uuid', async () => {
    await expect(run(alice(), 'notes.list', { tagId: 'nope' })).rejects.toBeInstanceOf(ZodError);
  });

  it('dailyOnly lists daily notes newest day first with dailyDate', async () => {
    const old = await create(alice(), '2026-10-01');
    const recent = await create(alice(), '2026-10-05');
    await create(alice(), 'normal');
    await t.db.update(notes).set({ dailyDate: '2026-10-01' }).where(eq(notes.id, old.id));
    await t.db.update(notes).set({ dailyDate: '2026-10-05' }).where(eq(notes.id, recent.id));
    const list = (await run<NoteSummary[]>(alice(), 'notes.list', { dailyOnly: true })).data;
    expect(list.map((note) => [note.id, note.dailyDate])).toEqual([
      [recent.id, '2026-10-05'],
      [old.id, '2026-10-01'],
    ]);
    const all = (await run<NoteSummary[]>(alice(), 'notes.list', {})).data;
    expect(all.find((note) => note.title === 'normal')?.dailyDate).toBeNull();
    expect((await get(alice(), recent.id)).dailyDate).toBe('2026-10-05');
  });
});

describe('notes.create with a template', () => {
  const addTemplate = async (userId: string, contentMd: string, name = 'T') => {
    const [row] = await t.db.insert(noteTemplates).values({ userId, name, contentMd }).returning();
    if (!row) throw new Error('no template');
    return row;
  };

  it('fills {{title}}, {{date}} and {{time}} in India time and runs the save hooks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T19:10:00.000Z')); // 00:40 on the 14th in India
    try {
      const template = await addTemplate(ALICE, '# {{title}}\n{{date}} {{time}} #meeting');
      const note = (
        await run<Note>(alice(), 'notes.create', { title: 'Plan', templateId: template.id })
      ).data;
      expect(note.contentMd).toBe('# Plan\n2026-10-14 00:40 #meeting');
      expect(await storedTags(note.id)).toEqual(['meeting']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets contentMd win over the template, even an empty one', async () => {
    const template = await addTemplate(ALICE, 'from template');
    const sent = (
      await run<Note>(alice(), 'notes.create', {
        title: 'X',
        contentMd: 'mine',
        templateId: template.id,
      })
    ).data;
    expect(sent.contentMd).toBe('mine');
    const empty = (
      await run<Note>(alice(), 'notes.create', {
        title: 'Y',
        contentMd: '',
        templateId: template.id,
      })
    ).data;
    expect(empty.contentMd).toBe('');
  });

  it('answers 404 for a missing, trashed or foreign template', async () => {
    const foreign = await addTemplate(BOB, 'x', 'Bobs');
    const trashed = await addTemplate(ALICE, 'x', 'Old');
    await t.db
      .update(noteTemplates)
      .set({ deletedAt: new Date() })
      .where(eq(noteTemplates.id, trashed.id));
    for (const templateId of [MISSING, foreign.id, trashed.id]) {
      await expect(run(alice(), 'notes.create', { templateId })).rejects.toMatchObject({
        statusCode: 404,
      });
    }
    expect((await run<NoteSummary[]>(alice(), 'notes.list', {})).data).toEqual([]);
  });
});
