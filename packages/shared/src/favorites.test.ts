import { describe, expect, it } from 'vitest';
import {
  createFavoriteInput,
  favoriteViewSchema,
  sameFavoriteView,
  updateFavoriteInput,
} from './favorites';
import { restoreTagInput, unmergeTagInput } from './tag-management';
import { TAG_PALETTE } from './tags';

const ID = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const OTHER = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

describe('favoriteViewSchema', () => {
  it('removes repeated values in status, priority and tagIds', () => {
    const view = favoriteViewSchema.parse({
      status: ['todo', 'todo', 'done'],
      priority: [1, 1, 2],
      tagIds: [ID, OTHER, ID],
    });
    expect(view).toEqual({ status: ['todo', 'done'], priority: [1, 2], tagIds: [ID, OTHER] });
  });

  it('still treats lists as sets after removing repeats', () => {
    const a = favoriteViewSchema.parse({ tagIds: [ID, OTHER, ID] });
    const b = favoriteViewSchema.parse({ tagIds: [OTHER, ID] });
    expect(sameFavoriteView(a, b)).toBe(true);
  });
});

describe('favorite colors', () => {
  const view = { sort: 'due' } as const;

  it('match the palette ignoring case and keep the palette spelling', () => {
    const lower = TAG_PALETTE[1].toLowerCase();
    expect(createFavoriteInput.parse({ name: 'a', view, color: lower }).color).toBe(TAG_PALETTE[1]);
    expect(updateFavoriteInput.parse({ id: ID, color: lower }).color).toBe(TAG_PALETTE[1]);
  });

  it('refuse a color outside the palette', () => {
    expect(createFavoriteInput.safeParse({ name: 'a', view, color: '#123456' }).success).toBe(
      false,
    );
  });
});

describe('tag undo inputs', () => {
  it('remove repeated task ids', () => {
    expect(
      restoreTagInput.parse({ id: ID, taskIds: [OTHER, OTHER], favorites: [] }).taskIds,
    ).toEqual([OTHER]);
    expect(
      unmergeTagInput.parse({ sourceId: ID, targetId: OTHER, taskIds: [ID, ID], favorites: [] })
        .taskIds,
    ).toEqual([ID]);
  });
});
