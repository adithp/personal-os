import { describe, expect, it } from 'vitest';
import {
  createNoteInput,
  createNoteTemplateInput,
  dailyDateSchema,
  listNotesInput,
  noteSummarySchema,
  openDailyInput,
  updateNoteTemplateInput,
} from './notes';
import { tagSchema } from './tags';

const uuid = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('N3 note schemas', () => {
  it('accepts real days only', () => {
    expect(dailyDateSchema.safeParse('2026-10-14').success).toBe(true);
    expect(dailyDateSchema.safeParse('2028-02-29').success).toBe(true);
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '26-10-14',
      '2026-1-1',
      '',
      '2026-10-14T00:00',
    ]) {
      expect(dailyDateSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(openDailyInput.parse({})).toEqual({});
  });

  it('checks template input', () => {
    expect(createNoteTemplateInput.parse({ name: '  Meeting ' })).toEqual({
      name: 'Meeting',
      contentMd: '',
      isDailyDefault: false,
    });
    expect(createNoteTemplateInput.safeParse({ name: '' }).success).toBe(false);
    expect(createNoteTemplateInput.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
    expect(
      createNoteTemplateInput.safeParse({ name: 'a', contentMd: 'x'.repeat(200_001) }).success,
    ).toBe(false);
    expect(updateNoteTemplateInput.safeParse({ id: uuid }).success).toBe(false);
    expect(updateNoteTemplateInput.safeParse({ id: uuid, isDailyDefault: true }).success).toBe(
      true,
    );
  });

  it('keeps the older shapes valid', () => {
    expect(createNoteInput.parse({ templateId: uuid })).toEqual({ templateId: uuid });
    expect(listNotesInput.parse({ tagId: uuid, dailyOnly: 'true' }).dailyOnly).toBe(true);
    expect(listNotesInput.parse({}).dailyOnly).toBeUndefined();
    const summary = {
      id: uuid,
      title: 'a',
      folderId: null,
      pinned: false,
      excerpt: '',
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      deletedAt: null,
    };
    expect(noteSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      noteSummarySchema.safeParse({ ...summary, tagNames: ['a'], dailyDate: '2026-10-14' }).success,
    ).toBe(true);
    const tag = {
      id: uuid,
      name: 'a',
      color: '#F7D96B',
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    };
    expect(tagSchema.safeParse(tag).success).toBe(true);
    expect(tagSchema.safeParse({ ...tag, noteCount: 3 }).success).toBe(true);
  });
});
