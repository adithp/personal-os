import { beforeEach, describe, expect, it } from 'vitest';
import { RECENT_MAX, RECENT_STORAGE_KEY, useRecentItems } from './recent-items-store';

const item = (n: number) => ({
  type: 'task' as const,
  id: `id-${String(n)}`,
  title: `Task ${String(n)}`,
});

beforeEach(() => {
  localStorage.clear();
  useRecentItems.setState({ items: [] });
});

describe('recent items', () => {
  it('puts the newest first and keeps only 5', () => {
    for (let n = 1; n <= 7; n++) useRecentItems.getState().add(item(n));
    const ids = useRecentItems.getState().items.map((i) => i.id);
    expect(ids).toHaveLength(RECENT_MAX);
    expect(ids).toEqual(['id-7', 'id-6', 'id-5', 'id-4', 'id-3']);
  });

  it('moves an item opened again to the front instead of repeating it', () => {
    for (let n = 1; n <= 3; n++) useRecentItems.getState().add(item(n));
    useRecentItems.getState().add({ ...item(1), title: 'Renamed' });
    const items = useRecentItems.getState().items;
    expect(items.map((i) => i.id)).toEqual(['id-1', 'id-3', 'id-2']);
    expect(items[0]?.title).toBe('Renamed');
  });

  it('drops stored items that are not valid when it loads', async () => {
    const good = {
      type: 'tag',
      id: '00000000-0000-4000-8000-000000000001',
      title: 'home',
      color: '#aabbcc',
    };
    const stored = [
      good,
      { type: 'task', id: 'not-a-uuid', title: 'Bad id' },
      { type: 'bogus', id: '00000000-0000-4000-8000-000000000002', title: 'Bad type' },
      { type: 'task', id: '00000000-0000-4000-8000-000000000003', title: 'x'.repeat(201) },
      {
        type: 'tag',
        id: '00000000-0000-4000-8000-000000000004',
        title: 't',
        color: 'c'.repeat(33),
      },
      { type: 'task', id: '00000000-0000-4000-8000-000000000005', title: 42 },
      { type: 'task', id: '00000000-0000-4000-8000-000000000006', title: 'Extra', evil: true },
      'junk',
      null,
    ];
    localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify({ state: { items: stored }, version: 1 }),
    );
    await useRecentItems.persist.rehydrate();
    expect(useRecentItems.getState().items).toEqual([good]);
  });

  it('starts empty when the stored value is damaged', async () => {
    localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify({ state: { items: 'oops' }, version: 1 }),
    );
    await useRecentItems.persist.rehydrate();
    expect(useRecentItems.getState().items).toEqual([]);
  });

  it('forgets everything on this device when cleared', () => {
    useRecentItems.getState().add(item(1));
    expect(localStorage.getItem(RECENT_STORAGE_KEY)).not.toBeNull();
    useRecentItems.getState().clear();
    expect(useRecentItems.getState().items).toEqual([]);
    expect(localStorage.getItem(RECENT_STORAGE_KEY)).toBeNull();
  });

  it('tells a task and a tag with the same id apart', () => {
    useRecentItems.getState().add(item(1));
    useRecentItems.getState().add({ type: 'tag', id: 'id-1', title: 'home' });
    expect(useRecentItems.getState().items).toHaveLength(2);
  });
});
