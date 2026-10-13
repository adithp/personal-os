import type { FavoriteView } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import {
  currentFavoriteView,
  favoriteViewToSearch,
  suggestFavoriteIcon,
  suggestFavoriteName,
} from './view';

const TAG = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const names = new Map([[TAG, 'home']]);

describe('favorite view and URL search', () => {
  it('turns a view into search params and back', () => {
    const view: FavoriteView = {
      priority: [1, 2],
      tagIds: [TAG],
      due: 'week',
      group: 'tag',
      sort: 'due',
    };
    const search = favoriteViewToSearch(view);
    expect(search).toEqual({
      priority: [1, 2],
      tag: [TAG],
      due: 'week',
      group: 'tag',
      sort: 'due',
    });
    expect(currentFavoriteView(search, 'due', 'tag')).toEqual(view);
  });

  it('opens a view without sort or group with the My tasks defaults', () => {
    expect(favoriteViewToSearch({ priority: [1] })).toEqual({
      priority: [1],
      group: 'due',
      sort: 'manual',
    });
    // ...and that is still the same view as far as the active row and Save this view go
    expect(currentFavoriteView(favoriteViewToSearch({ priority: [1] }), 'manual', 'due')).toEqual({
      priority: [1],
    });
  });

  it('leaves defaults out, and is null when nothing differs from them', () => {
    expect(currentFavoriteView({}, 'manual', 'due')).toBeNull();
    expect(currentFavoriteView({ due: 'any' }, 'manual', 'due')).toBeNull();
    expect(currentFavoriteView({}, 'title', 'due')).toEqual({ sort: 'title' });
    expect(currentFavoriteView({ archived: true }, 'manual', 'none')).toEqual({
      archived: true,
      group: 'none',
    });
  });
});

describe('suggested name and icon', () => {
  it('names a one-tag view after the tag', () => {
    expect(suggestFavoriteName({ tagIds: [TAG] }, names)).toBe('home');
    expect(suggestFavoriteIcon({ tagIds: [TAG] })).toBe('hash');
  });

  it('describes other views in plain words', () => {
    expect(suggestFavoriteName({ priority: [2], due: 'week' }, names)).toBe(
      'High priority · This week',
    );
    expect(suggestFavoriteName({ status: ['doing'], tagIds: [TAG] }, names)).toBe(
      'In progress · home',
    );
    expect(suggestFavoriteName({ archived: true }, names)).toBe('Archived');
    expect(suggestFavoriteName({ sort: 'title' }, names)).toBe('Sorted');
  });

  it('keeps a name within 40 characters', () => {
    const long = new Map([[TAG, 'a'.repeat(40)]]);
    expect(
      suggestFavoriteName({ priority: [1], tagIds: [TAG], due: 'overdue' }, long).length,
    ).toBeLessThanOrEqual(40);
  });

  it('picks an icon from the first thing that is set', () => {
    expect(suggestFavoriteIcon({ priority: [1] })).toBe('flag');
    expect(suggestFavoriteIcon({ due: 'today' })).toBe('calendar');
    expect(suggestFavoriteIcon({ status: ['todo'] })).toBe('progress');
    expect(suggestFavoriteIcon({ archived: true })).toBe('archive');
    expect(suggestFavoriteIcon({ sort: 'due' })).toBe('star');
  });
});
