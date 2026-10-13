import { describe, expect, it } from 'vitest';
import { moveTarget } from './reorder';

const ids = ['a', 'b', 'c', 'd'];

describe('moveTarget', () => {
  it('puts a favorite between the two it lands between', () => {
    expect(moveTarget(ids, 'a', 2)).toEqual({ afterId: 'c', beforeId: 'd' });
    expect(moveTarget(ids, 'd', 1)).toEqual({ afterId: 'a', beforeId: 'b' });
  });

  it('gives only the neighbour below when it goes first, and only the one above when last', () => {
    expect(moveTarget(ids, 'c', 0)).toEqual({ beforeId: 'a' });
    expect(moveTarget(ids, 'a', 3)).toEqual({ afterId: 'd' });
  });

  it('moves one step for Move up and Move down', () => {
    expect(moveTarget(ids, 'c', 1)).toEqual({ afterId: 'a', beforeId: 'b' });
    expect(moveTarget(ids, 'b', 2)).toEqual({ afterId: 'c', beforeId: 'd' });
  });

  it('does nothing when it would not move, or the place or the id is not in the list', () => {
    expect(moveTarget(ids, 'b', 1)).toBeNull();
    expect(moveTarget(ids, 'a', -1)).toBeNull();
    expect(moveTarget(ids, 'd', 4)).toBeNull();
    expect(moveTarget(ids, 'zzz', 0)).toBeNull();
  });
});
