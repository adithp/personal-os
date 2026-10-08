import { describe, expect, it } from 'vitest';
import { validateTaskSearch } from './my-tasks-search';

describe('validateTaskSearch', () => {
  it('keeps valid values', () => {
    expect(
      validateTaskSearch({
        status: ['todo', 'doing'],
        priority: [1, '2'],
        tag: 't1',
        due: 'week',
        archived: 'true',
        group: 'tag',
        sort: 'due',
        task: '00000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      status: ['todo', 'doing'],
      priority: [1, 2],
      tag: ['t1'],
      due: 'week',
      archived: true,
      group: 'tag',
      sort: 'due',
      task: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('drops what is invalid instead of failing', () => {
    expect(
      validateTaskSearch({
        status: ['later', 'done'],
        priority: [0, 9, 'x'],
        due: 'whenever',
        archived: 'nope',
        group: 'colour',
        sort: 'random',
        task: 'abc',
        extra: 1,
      }),
    ).toEqual({ status: ['done'] });
    expect(validateTaskSearch({})).toEqual({});
  });
});
