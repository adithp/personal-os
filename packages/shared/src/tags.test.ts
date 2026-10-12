import { describe, expect, it } from 'vitest';
import { createTaskInput, listTasksInput } from './tasks';
import {
  MAX_TAGS_PER_TASK,
  TAG_PALETTE,
  createTagInput,
  nextTagColor,
  tagActions,
  updateTagInput,
} from './tags';

const ID = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';

describe('tag colors', () => {
  it('cycle through the module pastel palette', () => {
    expect(TAG_PALETTE).toHaveLength(10);
    expect(nextTagColor(0)).toBe('#F7D96B');
    expect(nextTagColor(1)).toBe(TAG_PALETTE[1]);
    expect(nextTagColor(10)).toBe(TAG_PALETTE[0]);
    expect(nextTagColor(23)).toBe(TAG_PALETTE[3]);
    expect(nextTagColor(-1)).toBe(TAG_PALETTE[9]);
  });
});

describe('createTagInput', () => {
  it('trims the name and takes an optional color', () => {
    expect(createTagInput.parse({ name: ' work ' })).toEqual({ name: 'work' });
    expect(createTagInput.parse({ name: 'work', color: '#F7D96B' }).color).toBe('#F7D96B');
  });

  it.each([
    [{ name: '' }],
    [{ name: 'two words' }],
    [{ name: '#hash' }],
    [{ name: 'x'.repeat(41) }],
    [{ name: 'ok', color: 'red' }],
  ])('refuses %j', (input) => {
    expect(createTagInput.safeParse(input).success).toBe(false);
  });
});

describe('updateTagInput', () => {
  it('needs something to change', () => {
    expect(updateTagInput.safeParse({ id: ID }).success).toBe(false);
    expect(updateTagInput.safeParse({ id: ID, name: 'new' }).success).toBe(true);
  });
});

describe('tag actions', () => {
  it('are list (read), create and update (write)', () => {
    expect(Object.values(tagActions).map((a) => [a.name, a.permission])).toEqual([
      ['tags.list', 'read'],
      ['tags.create', 'write'],
      ['tags.update', 'write'],
    ]);
  });
});

describe('task input with tags, subtasks, and all-day dates', () => {
  it('accepts tag ids, a parent, and an all-day date', () => {
    const parsed = createTaskInput.parse({
      title: 'x',
      tagIds: [ID],
      parentTaskId: ID,
      dueAt: '2025-10-06T18:30:00.000Z',
      dueAllDay: true,
    });
    expect(parsed.tagIds).toEqual([ID]);
  });

  it('refuses an all-day task without a date, and too many tags', () => {
    expect(createTaskInput.safeParse({ title: 'x', dueAllDay: true }).success).toBe(false);
    const many = Array.from({ length: MAX_TAGS_PER_TASK + 1 }, () => ID);
    expect(createTaskInput.safeParse({ title: 'x', tagIds: many }).success).toBe(false);
  });

  it('lists with the new filters, from text query values', () => {
    const parsed = listTasksInput.parse({
      priority: ['1', '2'],
      tagId: ID,
      noDate: 'true',
      parent: ID,
      completedAfter: '2025-10-01T00:00:00.000Z',
    });
    expect(parsed).toMatchObject({ priority: [1, 2], tagId: ID, noDate: true, parent: ID });
    expect(listTasksInput.parse({}).parent).toBe('none');
    expect(listTasksInput.safeParse({ priority: '9' }).success).toBe(false);
  });
});

describe('tag names with invisible characters', () => {
  it('are refused (zero-width space, bidi overrides, byte order mark, control characters)', () => {
    for (const name of ['work\u200B', '\u202Ework', 'wo\u0007rk', 'wo\uFEFFrk', 'wo\u2060rk']) {
      expect(createTagInput.safeParse({ name }).success, JSON.stringify(name)).toBe(false);
    }
  });

  it('still accept normal names and the joiners that Indic scripts need', () => {
    expect(createTagInput.safeParse({ name: 'work' }).success).toBe(true);
    expect(createTagInput.safeParse({ name: 'काम' }).success).toBe(true);
    expect(createTagInput.safeParse({ name: 'ക\u200Dര' }).success).toBe(true);
  });
});
