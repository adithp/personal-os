import type { NoteFolder } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { filterByTitle, noteDate, pinnedFirst } from './list/format';
import { folderParam, placeOf, validateNotesSearch } from './notes-search';
import { allNodes, buildTree, folderPath, idsInside, subtreeHeight } from './shell/folder-tree';

const folder = (id: string, name: string, parentId: string | null = null): NoteFolder => ({
  id,
  name,
  parentId,
  noteCount: 0,
  createdAt: '2025-10-01T00:00:00.000Z',
  updatedAt: '2025-10-01T00:00:00.000Z',
});

describe('buildTree', () => {
  const folders = [
    folder('b', 'beta'),
    folder('a', 'Alpha'),
    folder('c', 'Child', 'a'),
    folder('d', 'Deep', 'c'),
    folder('x', 'Orphan', 'gone'),
  ];

  it('sorts each level by name ignoring case and numbers the depth from 1', () => {
    const tree = buildTree(folders);
    expect(tree.map((node) => node.folder.name)).toEqual(['Alpha', 'beta', 'Orphan']);
    expect(allNodes(tree).map((node) => [node.folder.name, node.depth])).toEqual([
      ['Alpha', 1],
      ['Child', 2],
      ['Deep', 3],
      ['beta', 1],
      ['Orphan', 1],
    ]);
  });

  it('measures a subtree and lists what is inside a folder', () => {
    const alpha = buildTree(folders)[0];
    if (!alpha) throw new Error('no tree');
    expect(subtreeHeight(alpha)).toBe(3);
    expect([...idsInside(alpha)].sort()).toEqual(['a', 'c', 'd']);
  });

  it('gives the path of names from the top', () => {
    expect(folderPath(folders, 'd')).toEqual(['Alpha', 'Child', 'Deep']);
    expect(folderPath(folders, null)).toEqual([]);
  });
});

describe('the list helpers', () => {
  it('filters by title ignoring case and keeps everything for an empty filter', () => {
    const notes = [{ title: 'Garden plan' }, { title: 'Taxes' }];
    expect(filterByTitle(notes, ' PLAN ')).toEqual([{ title: 'Garden plan' }]);
    expect(filterByTitle(notes, '  ')).toEqual(notes);
  });

  it('puts pinned notes first and keeps the order inside each group', () => {
    const notes = [
      { id: 1, pinned: false },
      { id: 2, pinned: true },
      { id: 3, pinned: false },
      { id: 4, pinned: true },
    ];
    expect(pinnedFirst(notes).map((note) => note.id)).toEqual([2, 4, 1, 3]);
  });

  it('writes dates in India time: clock today, Yesterday, then the day', () => {
    // 00:10 on 8 October in India is still 7 October in UTC
    const now = new Date('2025-10-07T18:40:00.000Z');
    expect(noteDate('2025-10-07T18:35:00.000Z', now)).toBe('12:05 AM');
    expect(noteDate('2025-10-07T09:30:00.000Z', now)).toBe('Yesterday');
    expect(noteDate('2025-10-01T09:30:00.000Z', now)).toBe('1 Oct');
    expect(noteDate('2024-12-30T20:00:00.000Z', now)).toBe('31 Dec 2024');
  });
});

describe('the link params', () => {
  const id = '00000000-0000-4000-8000-000000000001';

  it('keeps a valid note id and folder, and drops anything else', () => {
    expect(validateNotesSearch({ note: id, folder: 'trash' })).toEqual({
      note: id,
      folder: 'trash',
    });
    expect(validateNotesSearch({ folder: id })).toEqual({ folder: id });
    expect(validateNotesSearch({ note: 'nope', folder: 'all' })).toEqual({});
    expect(validateNotesSearch({ note: 5 })).toEqual({});
  });

  it('turns a place into a param and back', () => {
    expect(placeOf({})).toBe('all');
    expect(placeOf({ folder: 'trash' })).toBe('trash');
    expect(folderParam('all')).toBeUndefined();
    expect(folderParam(id)).toBe(id);
  });
});
