import { beforeEach, describe, expect, it } from 'vitest';
import { RECENT_MAX, useRecentItems } from './recent-items-store';

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

  it('tells a task and a tag with the same id apart', () => {
    useRecentItems.getState().add(item(1));
    useRecentItems.getState().add({ type: 'tag', id: 'id-1', title: 'home' });
    expect(useRecentItems.getState().items).toHaveLength(2);
  });
});
