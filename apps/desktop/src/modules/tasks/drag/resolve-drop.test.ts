import type { Task } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { makeTask } from '../../../test/fake-api';
import { startOfIstDay } from '../dates';
import { columnDropId, parseDropId, sectionDropId } from './drop-ids';
import { POSITION_STEP, positionBetween } from './position';
import { resolveDrop, type DropContext, type DropTarget } from './resolve-drop';

// 12 Oct 2025, 15:00 in India
const now = new Date('2025-10-12T09:30:00Z');
const todayStart = startOfIstDay(now.getTime());
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.parse(todayStart) + days * DAY).toISOString();

const drop = (task: Task, target: DropTarget, extra: Partial<DropContext> = {}) =>
  resolveDrop({ task, target, now, manualSort: true, sameContainer: false, ...extra });
const section = (name: 'overdue' | 'today' | 'upcoming' | 'nodate' | 'completed'): DropTarget => ({
  kind: 'section',
  section: name,
});

describe('positionBetween', () => {
  it('uses the middle, or a step beyond the only neighbour', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(1000)).toBe(1000 + POSITION_STEP);
    expect(positionBetween(undefined, 1000)).toBe(1000 - POSITION_STEP);
    expect(positionBetween()).toBe(POSITION_STEP);
  });
});

describe('drop ids', () => {
  it('round-trips sections and columns, and ignores task ids', () => {
    expect(parseDropId(sectionDropId('today'))).toEqual({ kind: 'section', section: 'today' });
    expect(parseDropId(columnDropId('doing'))).toEqual({ kind: 'column', status: 'doing' });
    expect(parseDropId('00000000-0000-4000-8000-000000000001')).toBeNull();
    expect(parseDropId('section:nowhere')).toBeNull();
  });
});

describe('resolveDrop: sections', () => {
  it('Today gives a task with no date an all-day date of today', () => {
    const task = makeTask({ dueAt: null });
    expect(drop(task, section('today'))).toMatchObject({
      kind: 'move',
      input: { id: task.id, dueAt: todayStart, dueAllDay: true },
    });
  });

  it('Today keeps the time of day of a timed task', () => {
    const task = makeTask({
      dueAt: new Date(Date.parse(inDays(3)) + 9 * 3600 * 1000).toISOString(),
    });
    const result = drop(task, section('today'));
    expect(result).toMatchObject({
      kind: 'move',
      input: {
        dueAt: new Date(Date.parse(todayStart) + 9 * 3600 * 1000).toISOString(),
        dueAllDay: false,
      },
    });
  });

  it('Today reopens a done task and sets its date', () => {
    const task = makeTask({ status: 'done', dueAt: null, completedAt: now.toISOString() });
    expect(drop(task, section('today'))).toMatchObject({
      kind: 'move',
      input: { status: 'todo', dueAt: todayStart },
    });
  });

  it('Upcoming asks for a date, and keeps the neighbours', () => {
    const prev = makeTask({ position: 1000 });
    const task = makeTask({ dueAt: null });
    const result = drop(task, section('upcoming'), { prev });
    expect(result).toMatchObject({ kind: 'pick-date', input: { id: task.id, afterId: prev.id } });
  });

  it('Overdue accepts no drops', () => {
    expect(drop(makeTask(), section('overdue')).kind).toBe('reject');
  });

  it('Completed completes, and does nothing for a task that is already done', () => {
    const open = makeTask();
    expect(drop(open, section('completed'))).toEqual({
      kind: 'move',
      input: { id: open.id, status: 'done' },
    });
    const done = makeTask({ status: 'done', completedAt: now.toISOString() });
    expect(drop(done, section('completed')).kind).toBe('none');
  });

  it('No date only reorders inside itself', () => {
    const task = makeTask({ dueAt: null });
    expect(drop(task, section('nodate'), { sameContainer: true }).kind).toBe('move');
    const dated = makeTask({ dueAt: inDays(2) });
    expect(drop(dated, section('nodate')).kind).toBe('reject');
  });

  it('reordering inside a section needs manual sort', () => {
    const task = makeTask({ dueAt: todayStart });
    const next = makeTask({ position: 2000 });
    expect(drop(task, section('today'), { sameContainer: true, next })).toMatchObject({
      kind: 'move',
      input: { id: task.id, beforeId: next.id },
      position: 2000 - POSITION_STEP,
    });
    expect(drop(task, section('today'), { sameContainer: true, manualSort: false })).toEqual({
      kind: 'reject',
      message: 'Sort is not Manual, so reordering is off.',
    });
  });
});

describe('resolveDrop: columns and lists', () => {
  it('a new column changes the status, with any sort', () => {
    const task = makeTask({ status: 'todo' });
    expect(drop(task, { kind: 'column', status: 'doing' }, { manualSort: false })).toEqual({
      kind: 'move',
      input: { id: task.id, status: 'doing' },
    });
  });

  it('the same column reorders only inside it, and only in manual sort', () => {
    const task = makeTask({ status: 'todo' });
    const column: DropTarget = { kind: 'column', status: 'todo' };
    expect(drop(task, column, { sameContainer: true }).kind).toBe('move');
    expect(drop(task, column, { sameContainer: true, manualSort: false }).kind).toBe('reject');
  });

  it('a list with no date meaning only allows reordering inside it', () => {
    const task = makeTask();
    expect(drop(task, { kind: 'list' }, { sameContainer: true }).kind).toBe('move');
    expect(drop(task, { kind: 'list' }).kind).toBe('reject');
  });
});
