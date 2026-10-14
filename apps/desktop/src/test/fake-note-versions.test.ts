import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeNote } from './fake-api';
import { makeVersion } from './fake-note-versions';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2025-10-07T09:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const minutes = (n: number) => {
  vi.setSystemTime(new Date(Date.now() + n * 60_000));
};

function setup(contentMd = 'one two') {
  const note = makeNote({ contentMd });
  const fake = createFakeApi([], [], [], [], [note]);
  const save = (text: string, revision: number, extra: Record<string, unknown> = {}) =>
    fake.api.request('PATCH', `/notes/${note.id}`, {
      body: { baseRevision: revision, contentMd: text, ...extra },
    });
  return { note, fake, save };
}

describe('the mock note versions', () => {
  it('stores the previous text on a save when there is no version yet, then waits 10 minutes', async () => {
    const { note, fake, save } = setup();
    await save('one two three', 1);
    expect(fake.noteVersions.versions(note.id)).toHaveLength(1);
    minutes(9);
    await save('one two three four', 2);
    expect(fake.noteVersions.versions(note.id)).toHaveLength(1);
    minutes(2);
    await save('one two three four five', 3);
    const [newest] = fake.noteVersions.versions(note.id);
    expect(fake.noteVersions.versions(note.id)).toHaveLength(2);
    expect(newest).toMatchObject({ reason: 'auto', words: 4, wordsDelta: 2 });
  });

  it('skips an empty text and a text equal to the newest version', async () => {
    const empty = setup('');
    await empty.save('hello', 1);
    expect(empty.fake.noteVersions.versions(empty.note.id)).toHaveLength(0);

    const same = setup('same text');
    same.fake.noteVersions.seed(same.note.id, [
      makeVersion({ createdAt: '2025-10-01T00:00:00.000Z', contentMd: 'same text' }),
    ]);
    await same.save('changed', 1);
    expect(same.fake.noteVersions.versions(same.note.id)).toHaveLength(1);
  });

  it('keeps the newest 50', async () => {
    const { note, fake, save } = setup('start');
    for (let n = 1; n <= 60; n += 1) {
      minutes(11);
      await save(`text ${String(n)}`, n);
    }
    expect(fake.noteVersions.versions(note.id)).toHaveLength(50);
  });

  it('restores a version, keeps the current text as before_restore and undoes it', async () => {
    const { note, fake, save } = setup('old text');
    await save('new text here', 1);
    const [old] = fake.noteVersions.versions(note.id);
    const restored = await fake.api.request<{
      item: { contentMd: string; revision: number };
      undo: { action: string; input: { id: string; versionId: string } };
    }>('POST', `/notes/${note.id}/restore/${old?.id ?? ''}`);
    expect(restored.item).toMatchObject({ contentMd: 'old text', revision: 3 });
    expect(fake.noteVersions.versions(note.id)[0]?.reason).toBe('before_restore');
    expect(restored.undo.action).toBe('notes.restoreVersion');

    await fake.api.request('POST', '/undo', { body: restored.undo });
    expect(fake.notes()[0]?.contentMd).toBe('new text here');
  });

  it('stores the server text as a conflict version when a forced save overwrites a newer revision', async () => {
    const { note, fake, save } = setup('server text');
    await save('mine', 99, { force: true });
    expect(fake.noteVersions.versions(note.id)).toMatchObject([{ reason: 'conflict' }]);
  });

  it('answers 404 for an unknown note or version', async () => {
    const { note, fake } = setup();
    await expect(
      fake.api.request('GET', `/notes/00000000-0000-4000-8000-0000000000ff/versions`),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      fake.api.request('GET', `/notes/${note.id}/versions/00000000-0000-4000-a000-0000000000ff`),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('stores every forced save as a conflict version, even with the right revision', async () => {
    const { note, fake, save } = setup('server text');
    await save('mine', 1, { force: true });
    expect(fake.noteVersions.versions(note.id)).toMatchObject([{ reason: 'conflict' }]);
  });

  it('counts words of the plain text and compares with the next older version', async () => {
    const { note, fake } = setup('x');
    fake.noteVersions.seed(note.id, [
      makeVersion({ contentMd: '# Title\n\n**bold** [[Link]] word' }),
      makeVersion({ contentMd: '' }),
    ]);
    const [newer, older] = fake.noteVersions.versions(note.id);
    expect(older).toMatchObject({ words: 4, wordsDelta: 4 });
    expect(newer).toMatchObject({ words: 0, wordsDelta: -4 });
  });

  it('keeps a text that shrank to under 20% at once, however recent the last version is', async () => {
    const long = 'word '.repeat(60); // 300 characters
    const { note, fake, save } = setup(long);
    fake.noteVersions.seed(note.id, [makeVersion({ createdAt: new Date().toISOString() })]);
    await save('tiny', 1);
    expect(fake.noteVersions.versions(note.id)).toHaveLength(2);
    expect(fake.noteVersions.versions(note.id)[0]?.reason).toBe('auto');
    // A smaller cut of a short text still waits
    const short = setup('a short note');
    short.fake.noteVersions.seed(short.note.id, [
      makeVersion({ createdAt: new Date().toISOString() }),
    ]);
    await short.save('a', 1);
    expect(short.fake.noteVersions.versions(short.note.id)).toHaveLength(1);
  });

  it('stores before_restore even for an empty note, and restoring the same text changes nothing', async () => {
    const { note, fake } = setup('');
    fake.noteVersions.seed(note.id, [makeVersion({ contentMd: 'restored text' })]);
    const target = fake.noteVersions.versions(note.id)[0];
    const restored = await fake.api.request<{
      item: { revision: number; contentMd: string };
      undo: { input: { versionId: string } } | null;
    }>('POST', `/notes/${note.id}/restore/${target?.id ?? ''}`);
    // The empty current text is kept as before_restore
    expect(fake.noteVersions.versions(note.id)[0]).toMatchObject({
      reason: 'before_restore',
      words: 0,
    });
    expect(restored.undo).not.toBeNull();
    expect(restored.item).toMatchObject({ contentMd: 'restored text', revision: 2 });

    const again = await fake.api.request<{ item: { revision: number }; undo: unknown }>(
      'POST',
      `/notes/${note.id}/restore/${target?.id ?? ''}`,
    );
    expect(again.item.revision).toBe(2);
    expect(again.undo).toBeNull();
    expect(fake.noteVersions.versions(note.id)).toHaveLength(2);
  });
});
