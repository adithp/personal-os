import type { Task } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { makeTask } from '../../../test/fake-api';
import { sectionDropId } from '../drag/drop-ids';
import { NOT_MANUAL_MESSAGE } from '../drag/resolve-drop';
import { groupTasks, sortTasks, type GroupKey } from '../filters';
import { itemKeyOf, parseItemKey, planDrop, tomorrowOf } from './drop-plan';

// Tuesday 7 October 2025, 15:00 in India
const now = new Date('2025-10-07T09:30:00.000Z');
const TODAY_9AM = '2025-10-07T03:30:00.000Z';
const YESTERDAY = '2025-10-05T18:30:00.000Z';
const NEXT_WEEK = '2025-10-14T18:30:00.000Z';

const a = makeTask({ title: 'A', position: 1000 });
const b = makeTask({ title: 'B', position: 2000 });
const c = makeTask({ title: 'C', position: 3000 });
const late = makeTask({ title: 'Late', dueAt: YESTERDAY, dueAllDay: true, position: 4000 });
const dueToday = makeTask({ title: 'Due today', dueAt: TODAY_9AM, position: 5000 });
const later = makeTask({ title: 'Later', dueAt: NEXT_WEEK, dueAllDay: true, position: 6000 });
const done = makeTask({
  title: 'Done',
  status: 'done',
  completedAt: '2025-10-06T05:00:00.000Z',
  position: 7000,
});

function plan(
  tasks: Task[],
  activeGroup: string,
  active: Task,
  overKey: string | null,
  extra: { groupKey?: GroupKey; manualSort?: boolean; after?: boolean } = {},
) {
  const groupKey = extra.groupKey ?? 'due';
  const groups = groupTasks(sortTasks(tasks, 'manual'), groupKey, now);
  return planDrop({
    activeKey: itemKeyOf(activeGroup, active.id),
    overKey,
    groups,
    groupKey,
    now,
    manualSort: extra.manualSort ?? true,
    ...(extra.after !== undefined ? { after: extra.after } : {}),
  });
}

const everything = [a, b, c, late, dueToday, later, done];

describe('item keys', () => {
  it('round-trip, and reject other ids', () => {
    expect(parseItemKey(itemKeyOf('today', 'abc'))).toEqual({ groupId: 'today', taskId: 'abc' });
    expect(parseItemKey('section:today')).toBeNull();
    expect(parseItemKey('nope')).toBeNull();
  });
});

describe('reordering inside a section (Manual sort)', () => {
  it('moving A down onto C puts it after C', () => {
    expect(plan(everything, 'nodate', a, itemKeyOf('nodate', c.id))).toEqual({
      kind: 'move',
      input: { id: a.id, afterId: c.id },
      position: 3000 + 1024,
    });
  });

  it('moving C up onto A puts it before A', () => {
    expect(plan(everything, 'nodate', c, itemKeyOf('nodate', a.id))).toEqual({
      kind: 'move',
      input: { id: c.id, beforeId: a.id },
      position: 1000 - 1024,
    });
  });

  it('moving A onto B puts it between B and C', () => {
    expect(plan(everything, 'nodate', a, itemKeyOf('nodate', b.id))).toMatchObject({
      kind: 'move',
      input: { id: a.id, afterId: b.id, beforeId: c.id },
      position: 2500,
    });
  });

  it('does nothing when dropped on itself, or on its own section where it already is last', () => {
    expect(plan(everything, 'nodate', b, itemKeyOf('nodate', b.id))).toEqual({ kind: 'none' });
    expect(plan(everything, 'nodate', c, sectionDropId('nodate'))).toEqual({ kind: 'none' });
  });

  it('is refused with the message when Sort is not Manual', () => {
    expect(plan(everything, 'nodate', a, itemKeyOf('nodate', c.id), { manualSort: false })).toEqual(
      { kind: 'reject', message: NOT_MANUAL_MESSAGE },
    );
  });

  it('does nothing when there is no drop area', () => {
    expect(plan(everything, 'nodate', a, null)).toEqual({ kind: 'none' });
  });
});

describe('moving between sections', () => {
  it('Today: sets today (all-day) and sits before or after the card it was dropped on', () => {
    const before = plan(everything, 'nodate', a, itemKeyOf('today', dueToday.id));
    expect(before).toMatchObject({
      kind: 'move',
      input: { id: a.id, dueAllDay: true, beforeId: dueToday.id },
    });
    expect(before.kind === 'move' && before.input.afterId).toBeUndefined();
    const after = plan(everything, 'nodate', a, itemKeyOf('today', dueToday.id), { after: true });
    expect(after).toMatchObject({ input: { afterId: dueToday.id } });
  });

  it('Today keeps the time of a task that has one', () => {
    const result = plan(everything, 'upcoming', later, sectionDropId('today'));
    expect(result).toMatchObject({ kind: 'move', input: { id: later.id, dueAllDay: true } });
    const timed = makeTask({ title: 'Timed', dueAt: '2025-10-20T08:00:00.000Z', position: 9 });
    expect(plan([timed, dueToday], 'upcoming', timed, sectionDropId('today'))).toMatchObject({
      input: { dueAt: '2025-10-07T08:00:00.000Z', dueAllDay: false },
    });
  });

  it('a drop on the section area appends after the last card', () => {
    expect(plan(everything, 'nodate', a, sectionDropId('today'))).toMatchObject({
      kind: 'move',
      input: { afterId: dueToday.id },
    });
  });

  it('a drop on an empty section has no neighbours', () => {
    const result = plan([a, b], 'nodate', a, sectionDropId('today'));
    expect(result).toMatchObject({ kind: 'move', input: { id: a.id, dueAllDay: true } });
    expect(result.kind === 'move' && result.input).not.toHaveProperty('afterId');
  });

  it('still works when Sort is not Manual, without asking for a place', () => {
    const result = plan(everything, 'nodate', a, itemKeyOf('today', dueToday.id), {
      manualSort: false,
    });
    expect(result).toMatchObject({ kind: 'move', input: { id: a.id, dueAllDay: true } });
    expect(result.kind === 'move' && result.input).not.toHaveProperty('beforeId');
    expect(result.kind === 'move' && result.input).not.toHaveProperty('afterId');
  });

  it('Upcoming asks for a date', () => {
    expect(plan(everything, 'nodate', a, itemKeyOf('upcoming', later.id))).toMatchObject({
      kind: 'pick-date',
      input: { id: a.id },
    });
  });

  it('Overdue accepts no drops', () => {
    for (const over of [sectionDropId('overdue'), itemKeyOf('overdue', late.id)]) {
      expect(plan(everything, 'nodate', a, over)).toMatchObject({ kind: 'reject' });
    }
  });

  it('No date only reorders: another section is refused', () => {
    expect(plan(everything, 'today', dueToday, sectionDropId('nodate'))).toMatchObject({
      kind: 'reject',
    });
  });

  it('Completed completes', () => {
    expect(plan(everything, 'today', dueToday, sectionDropId('completed'))).toEqual({
      kind: 'move',
      input: { id: dueToday.id, status: 'done' },
    });
  });

  it('a completed task dragged to another section reopens', () => {
    expect(plan(everything, 'completed', done, sectionDropId('today'))).toMatchObject({
      kind: 'move',
      input: { id: done.id, status: 'todo', dueAllDay: true },
    });
    expect(plan(everything, 'completed', done, sectionDropId('upcoming'))).toMatchObject({
      kind: 'pick-date',
      input: { id: done.id, status: 'todo' },
    });
  });
});

describe('other groupings', () => {
  it('reorders inside a group, and refuses to cross to another', () => {
    const one = makeTask({ title: 'P1', priority: 1, position: 10 });
    const two = makeTask({ title: 'P1b', priority: 1, position: 20 });
    const three = makeTask({ title: 'P3', priority: 3, position: 30 });
    const tasks = [one, two, three];
    expect(plan(tasks, 'p1', one, itemKeyOf('p1', two.id), { groupKey: 'priority' })).toMatchObject(
      { kind: 'move', input: { id: one.id, afterId: two.id } },
    );
    expect(
      plan(tasks, 'p1', one, itemKeyOf('p3', three.id), { groupKey: 'priority' }),
    ).toMatchObject({ kind: 'reject' });
  });

  it('the day after today is the earliest date for Upcoming', () => {
    expect(tomorrowOf(now)).toBe('2025-10-08');
    // 00:10 in India on the 8th is still the 7th in UTC
    expect(tomorrowOf(new Date('2025-10-07T18:40:00.000Z'))).toBe('2025-10-09');
  });
});
