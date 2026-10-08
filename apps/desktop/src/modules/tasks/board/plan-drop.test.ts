import { describe, expect, it } from 'vitest';
import { makeTask } from '../../../test/fake-api';
import { columnDropId } from '../drag/drop-ids';
import { boardPlace, planBoardDrop } from './plan-drop';

const NOW = new Date('2025-10-07T09:30:00.000Z');

const a = makeTask({ title: 'A', status: 'todo', position: 1024 });
const b = makeTask({ title: 'B', status: 'todo', position: 2048 });
const c = makeTask({ title: 'C', status: 'doing', position: 3072 });
const d = makeTask({ title: 'D', status: 'done', position: 4096 });
const tasks = [a, b, c, d];

describe('boardPlace', () => {
  it('puts a card dropped on a column at the end of it', () => {
    expect(boardPlace({ tasks, activeId: a.id, overId: columnDropId('doing') })).toEqual({
      status: 'doing',
      index: 1,
    });
  });

  it('puts a card dropped on another column card before that card', () => {
    expect(boardPlace({ tasks, activeId: a.id, overId: c.id })).toEqual({
      status: 'doing',
      index: 0,
    });
  });

  it('puts a card moved down in its own column after the card it is over', () => {
    expect(boardPlace({ tasks, activeId: a.id, overId: b.id })).toEqual({
      status: 'todo',
      index: 1,
    });
  });

  it('gives nothing when it is over nothing', () => {
    expect(boardPlace({ tasks, activeId: a.id, overId: null })).toBeNull();
  });
});

describe('planBoardDrop', () => {
  it('moves a card to In progress with its neighbours when sort is manual', () => {
    const result = planBoardDrop(
      { tasks, activeId: a.id, overId: columnDropId('doing') },
      NOW,
      true,
    );
    expect(result).toMatchObject({
      kind: 'move',
      input: { id: a.id, status: 'doing', afterId: c.id },
    });
  });

  it('moves to Done without neighbours when sort is not manual', () => {
    const result = planBoardDrop(
      { tasks, activeId: a.id, overId: columnDropId('done') },
      NOW,
      false,
    );
    expect(result).toEqual({ kind: 'move', input: { id: a.id, status: 'done' } });
  });

  it('reorders inside a column when sort is manual', () => {
    const result = planBoardDrop({ tasks, activeId: a.id, overId: b.id }, NOW, true);
    expect(result).toMatchObject({ kind: 'move', input: { id: a.id, afterId: b.id } });
  });

  it('refuses to reorder when sort is not manual', () => {
    const result = planBoardDrop({ tasks, activeId: a.id, overId: b.id }, NOW, false);
    expect(result).toMatchObject({ kind: 'reject' });
  });

  it('does nothing when the card is put back where it was', () => {
    expect(planBoardDrop({ tasks, activeId: a.id, overId: a.id }, NOW, true)).toEqual({
      kind: 'none',
    });
  });

  it('reopens a done card dragged to To do', () => {
    const result = planBoardDrop(
      { tasks, activeId: d.id, overId: columnDropId('todo') },
      NOW,
      true,
    );
    expect(result).toMatchObject({ kind: 'move', input: { id: d.id, status: 'todo' } });
  });
});
