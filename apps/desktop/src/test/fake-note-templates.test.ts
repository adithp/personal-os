import type { Note, NoteTemplate } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeNote } from './fake-api';

/** The fake must answer like the N3 routes of the real server. */
const setup = () => {
  const fake = createFakeApi();
  const make = async (body: Partial<NoteTemplate> & { name: string }) =>
    (await fake.api.request<{ item: NoteTemplate }>('POST', '/note-templates', { body })).item;
  const daily = async (date: string) =>
    (await fake.api.request<{ item: Note }>('POST', '/notes/daily', { body: { date } })).item;
  return { fake, make, daily };
};

describe('the note templates mock API', () => {
  it('dailyOnly filters and orders before the limit', async () => {
    const fake = createFakeApi([], [], [], [], [makeNote({ title: 'Plain' })]);
    for (const date of ['2025-10-05', '2025-10-07', '2025-10-06']) {
      await fake.api.request('POST', '/notes/daily', { body: { date } });
    }
    const answer = await fake.api.request<{ items: { title: string }[] }>('GET', '/notes', {
      query: { dailyOnly: true, limit: 2 },
    });
    expect(answer.items.map((n) => n.title)).toEqual(['2025-10-07', '2025-10-06']);
  });

  it('restore renames on a name clash and never takes the daily default back', async () => {
    const { fake, make } = setup();
    const first = await make({ name: 'Journal', isDailyDefault: true });
    await fake.api.request('DELETE', `/note-templates/${first.id}`);
    await make({ name: 'Journal', isDailyDefault: true });
    const back = await fake.api.request<{ item: NoteTemplate }>(
      'POST',
      `/note-templates/${first.id}/restore`,
    );
    expect(back.item).toMatchObject({ name: 'Journal (2)', isDailyDefault: false });
    expect(fake.noteTemplates().filter((t) => t.isDailyDefault)).toHaveLength(1);
  });

  it('an update answers an undo that puts the old values back', async () => {
    const { fake, make } = setup();
    const template = await make({ name: 'Weekly' });
    const answer = await fake.api.request<{ undo: { action: string; input: unknown } }>(
      'PATCH',
      `/note-templates/${template.id}`,
      { body: { name: 'Monthly' } },
    );
    await fake.api.request('POST', '/undo', { body: answer.undo });
    expect(fake.noteTemplates()[0]?.name).toBe('Weekly');
  });

  it('a daily title clash tries (daily), (daily 2), and so on', async () => {
    const fake = createFakeApi(
      [],
      [],
      [],
      [],
      [makeNote({ title: '2025-03-04' }), makeNote({ title: '2025-03-04 (daily)' })],
    );
    const answer = await fake.api.request<{ item: Note }>('POST', '/notes/daily', {
      body: { date: '2025-03-04' },
    });
    expect(answer.item.title).toBe('2025-03-04 (daily 2)');
  });
});
