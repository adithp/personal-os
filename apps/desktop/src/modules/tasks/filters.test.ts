import { describe, expect, it } from 'vitest';
import { makeTask } from '../../test/fake-api';
import {
  applyFilters,
  filtersFromSearch,
  groupTasks,
  hasActiveFilters,
  searchFromFilters,
  sortTasks,
} from './filters';

const now = new Date('2025-10-07T09:30:00.000Z'); // 3 PM in India
const tag = (name: string) => ({
  id: `00000000-0000-4000-8000-${name.charCodeAt(0).toString().padStart(12, '0')}`,
  name,
  color: '#F7D96B',
});

const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title);

describe('applyFilters', () => {
  const work = tag('work');
  const tasks = [
    makeTask({
      title: 'a',
      status: 'todo',
      priority: 1,
      tags: [work],
      dueAt: '2025-10-06T05:00:00.000Z',
    }),
    makeTask({ title: 'b', status: 'doing', priority: 3, dueAt: '2025-10-07T12:00:00.000Z' }),
    makeTask({ title: 'c', status: 'done', priority: 4 }),
    makeTask({ title: 'd', archivedAt: '2025-10-01T00:00:00.000Z' }),
    makeTask({ title: 'sub', parentTaskId: '00000000-0000-4000-8000-0000000000aa' }),
    makeTask({ title: 'e', priority: 2, dueAt: '2025-10-12T05:00:00.000Z' }),
  ];

  it('hides archived tasks and subtasks by default', () => {
    expect(titles(applyFilters(tasks, {}, now))).toEqual(['a', 'b', 'c', 'e']);
  });

  it('shows only archived tasks when asked', () => {
    expect(titles(applyFilters(tasks, { archived: true }, now))).toEqual(['d']);
  });

  it('filters by status, priority, and tag (any of)', () => {
    expect(titles(applyFilters(tasks, { status: ['todo', 'doing'] }, now))).toEqual([
      'a',
      'b',
      'e',
    ]);
    expect(titles(applyFilters(tasks, { priority: [1, 2] }, now))).toEqual(['a', 'e']);
    expect(titles(applyFilters(tasks, { tagIds: [work.id] }, now))).toEqual(['a']);
  });

  it('filters by due range using India days', () => {
    expect(titles(applyFilters(tasks, { due: 'overdue' }, now))).toEqual(['a']);
    expect(titles(applyFilters(tasks, { due: 'today' }, now))).toEqual(['b']);
    expect(titles(applyFilters(tasks, { due: 'week' }, now))).toEqual(['b', 'e']);
    expect(titles(applyFilters(tasks, { due: 'none' }, now))).toEqual(['c']);
    expect(titles(applyFilters(tasks, { due: 'any' }, now))).toEqual(['a', 'b', 'c', 'e']);
  });

  it('combines filters with AND', () => {
    expect(titles(applyFilters(tasks, { priority: [1], status: ['doing'] }, now))).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for nothing or "any", true otherwise', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ due: 'any', status: [] })).toBe(false);
    expect(hasActiveFilters({ archived: true })).toBe(true);
    expect(hasActiveFilters({ priority: [1] })).toBe(true);
  });
});

describe('sortTasks', () => {
  const tasks = [
    makeTask({ title: 'b', priority: 3, position: 3, dueAt: '2025-10-09T00:00:00.000Z' }),
    makeTask({ title: 'a', priority: 1, position: 2 }),
    makeTask({ title: 'c', priority: 2, position: 1, dueAt: '2025-10-08T00:00:00.000Z' }),
  ];

  it('sorts manually by position, and does not change the input', () => {
    expect(titles(sortTasks(tasks, 'manual'))).toEqual(['c', 'a', 'b']);
    expect(titles(tasks)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by priority (1 first), title, and created', () => {
    expect(titles(sortTasks(tasks, 'priority'))).toEqual(['a', 'c', 'b']);
    expect(titles(sortTasks(tasks, 'title'))).toEqual(['a', 'b', 'c']);
    expect(titles(sortTasks(tasks, 'title', 'desc'))).toEqual(['c', 'b', 'a']);
  });

  it('sorts by due date with undated tasks last in both directions', () => {
    expect(titles(sortTasks(tasks, 'due'))).toEqual(['c', 'b', 'a']);
    expect(titles(sortTasks(tasks, 'due', 'desc'))).toEqual(['b', 'c', 'a']);
  });
});

describe('groupTasks', () => {
  const work = tag('work');
  const home = tag('home');
  const tasks = [
    makeTask({ title: 'a', tags: [work, home], priority: 1 }),
    makeTask({ title: 'b', tags: [home], priority: 4 }),
    makeTask({ title: 'c', priority: 1 }),
  ];

  it('"none" is one group', () => {
    expect(groupTasks(tasks, 'none', now)).toEqual([{ id: 'all', label: 'All tasks', tasks }]);
  });

  it('"due" keeps all five sections in order, even empty ones', () => {
    const groups = groupTasks(tasks, 'due', now);
    expect(groups.map((g) => g.id)).toEqual([
      'overdue',
      'today',
      'upcoming',
      'nodate',
      'completed',
    ]);
    expect(groups[3]?.tasks).toHaveLength(3);
  });

  it('"priority" leaves out empty groups', () => {
    expect(groupTasks(tasks, 'priority', now).map((g) => [g.label, titles(g.tasks)])).toEqual([
      ['Urgent', ['a', 'c']],
      ['Low', ['b']],
    ]);
  });

  it('"tag" puts a task in each of its tags, sorted by name, and untagged last', () => {
    expect(groupTasks(tasks, 'tag', now).map((g) => [g.label, titles(g.tasks)])).toEqual([
      ['home', ['a', 'b']],
      ['work', ['a']],
      ['No tag', ['c']],
    ]);
  });
});

describe('search params', () => {
  it('turns filters into only what is set, and back', () => {
    const filters = { status: ['todo' as const], tagIds: ['t1'], due: 'week' as const };
    expect(searchFromFilters(filters)).toEqual({ status: ['todo'], tag: ['t1'], due: 'week' });
    expect(searchFromFilters({})).toEqual({});
    expect(searchFromFilters({ due: 'any', archived: false })).toEqual({});
    expect(filtersFromSearch({ tag: ['t1'], archived: true })).toMatchObject({
      tagIds: ['t1'],
      archived: true,
    });
  });
});
