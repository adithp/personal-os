import { NOTE_CONTENT_MAX } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/api-client';
import { createNotesFake, makeNote } from './fake-notes';

/** The fake must answer like apps/server/src/actions/notes.ts; these pin the shapes down. */
const trashed = (title: string) => makeNote({ title, deletedAt: '2025-10-02T00:00:00.000Z' });

describe('the Notes mock API follows the real server', () => {
  it('GET /notes/:id returns a trashed note too', () => {
    const note = trashed('Old');
    const fake = createNotesFake([note]);
    expect(fake.handle('GET', `/notes/${note.id}`, {})).toEqual({ item: note });
  });

  it('GET /notes/:id answers 404 for an unknown note', () => {
    const fake = createNotesFake();
    expect(() => fake.handle('GET', '/notes/nope', {})).toThrow(ApiError);
  });

  it('DELETE /notes/:id/forever on a live note is 400 validation_error', () => {
    const note = makeNote();
    const fake = createNotesFake([note]);
    try {
      fake.handle('DELETE', `/notes/${note.id}/forever`, {});
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: 'validation_error' });
    }
  });

  it('DELETE /notes/:id/forever answers only the id', () => {
    const note = trashed('Old');
    const fake = createNotesFake([note]);
    expect(fake.handle('DELETE', `/notes/${note.id}/forever`, {})).toEqual({
      item: { id: note.id },
      undo: null,
    });
    expect(fake.trashed()).toHaveLength(0);
  });

  it('DELETE /notes/trash answers how many were deleted', () => {
    const fake = createNotesFake([trashed('A'), trashed('B'), makeNote()]);
    expect(fake.handle('DELETE', '/notes/trash', {})).toEqual({
      item: { deleted: 2 },
      undo: null,
    });
  });

  it('restoring a live note is a 200 no-op', () => {
    const note = makeNote();
    const fake = createNotesFake([note]);
    expect(fake.handle('POST', `/notes/${note.id}/restore`, {})).toEqual({
      item: note,
      undo: null,
    });
  });

  it('restoring with a taken title adds (2) and raises the revision', () => {
    const live = makeNote({ title: 'Plan' });
    const old = makeNote({ title: 'Plan', deletedAt: '2025-10-02T00:00:00.000Z', revision: 4 });
    const fake = createNotesFake([live, old]);
    const result = fake.handle('POST', `/notes/${old.id}/restore`, {}) as {
      item: { title: string; revision: number };
    };
    expect(result.item).toMatchObject({ title: 'Plan (2)', revision: 5 });
  });

  it('restoring with a free title keeps the revision', () => {
    const old = makeNote({ title: 'Solo', deletedAt: '2025-10-02T00:00:00.000Z', revision: 4 });
    const fake = createNotesFake([old]);
    const result = fake.handle('POST', `/notes/${old.id}/restore`, {}) as {
      item: { revision: number };
    };
    expect(result.item.revision).toBe(4);
  });

  it('builds the excerpt from the plain text of the Markdown', () => {
    const fake = createNotesFake();
    const result = fake.handle('POST', '/notes', {
      body: { title: 'Fmt', contentMd: '# Head\n\nSome **bold** text' },
    }) as { item: { excerpt: string } };
    expect(result.item.excerpt).not.toContain('#');
    expect(result.item.excerpt).not.toContain('**');
    expect(result.item.excerpt).toContain('bold');
  });

  it('refuses text over the limit on create and update', () => {
    const note = makeNote();
    const fake = createNotesFake([note]);
    const tooLong = 'x'.repeat(NOTE_CONTENT_MAX + 1);
    expect(() => fake.handle('POST', '/notes', { body: { contentMd: tooLong } })).toThrow(ApiError);
    expect(() =>
      fake.handle('PATCH', `/notes/${note.id}`, {
        body: { baseRevision: note.revision, contentMd: tooLong },
      }),
    ).toThrow(ApiError);
  });

  it('applies the title rules on rename', () => {
    const note = makeNote({ title: 'A' });
    const fake = createNotesFake([note]);
    for (const title of ['', '   ', 'a [b]', 'a|b', 'a#b', 'x'.repeat(201)]) {
      expect(() => fake.handle('POST', `/notes/${note.id}/rename`, { body: { title } })).toThrow(
        expect.objectContaining({ status: 400, code: 'validation_error' }) as Error,
      );
    }
  });
});
