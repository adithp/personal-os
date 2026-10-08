import { describe, expect, it } from 'vitest';
import { makeTask } from '../../test/fake-api';
import { dueSoon, groupIntoSections, inboxTasks, sectionOf, summarize } from './sections';

// 3:00 PM in India on Tuesday 7 October 2025
const now = new Date('2025-10-07T09:30:00.000Z');
const at = (iso: string) => ({ dueAt: iso });

describe('sectionOf (by India calendar day)', () => {
  it('puts a task due today in Today, even at 9 AM when it is already 3 PM', () => {
    expect(sectionOf(makeTask(at('2025-10-07T03:30:00.000Z')), now)).toBe('today');
  });

  it('puts earlier days in Overdue and later days in Upcoming', () => {
    expect(sectionOf(makeTask(at('2025-10-06T11:30:00.000Z')), now)).toBe('overdue');
    expect(sectionOf(makeTask(at('2025-10-08T03:30:00.000Z')), now)).toBe('upcoming');
  });

  it('uses India days, not UTC days', () => {
    // 00:10 on the 8th in India is still the 7th in UTC
    expect(sectionOf(makeTask(at('2025-10-07T18:40:00.000Z')), now)).toBe('upcoming');
    // 23:50 on the 7th in India is the 7th
    expect(sectionOf(makeTask(at('2025-10-07T18:20:00.000Z')), now)).toBe('today');
  });

  it('treats an all-day task like any other by its day', () => {
    const allDay = makeTask({ dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true }); // 7 Oct
    expect(sectionOf(allDay, now)).toBe('today');
  });

  it('puts tasks without a date in No date, and done tasks in Completed', () => {
    expect(sectionOf(makeTask(), now)).toBe('nodate');
    expect(sectionOf(makeTask({ status: 'done', ...at('2025-10-01T00:00:00.000Z') }), now)).toBe(
      'completed',
    );
  });
});

describe('groupIntoSections', () => {
  it('keeps every section and the incoming order', () => {
    const a = makeTask({ title: 'a' });
    const b = makeTask({ title: 'b', ...at('2025-10-06T05:00:00.000Z') });
    const c = makeTask({ title: 'c' });
    const groups = groupIntoSections([a, b, c], now);
    expect(Object.keys(groups)).toEqual(['overdue', 'today', 'upcoming', 'nodate', 'completed']);
    expect(groups.nodate.map((t) => t.title)).toEqual(['a', 'c']);
    expect(groups.overdue.map((t) => t.title)).toEqual(['b']);
    expect(groups.today).toEqual([]);
  });
});

describe('summarize', () => {
  it('counts open and overdue top-level tasks only', () => {
    const tasks = [
      makeTask(at('2025-10-06T05:00:00.000Z')),
      makeTask(),
      makeTask({ status: 'done' }),
      makeTask({ archivedAt: '2025-10-01T00:00:00.000Z' }),
      makeTask({ parentTaskId: '00000000-0000-4000-8000-0000000000aa' }),
    ];
    expect(summarize(tasks, now)).toEqual({ open: 2, overdue: 1 });
  });
});

describe('dueSoon', () => {
  it('lists overdue first, then today, then upcoming, by due date, at most five', () => {
    const tasks = [
      makeTask({ title: 'upcoming 2', ...at('2025-10-10T05:00:00.000Z') }),
      makeTask({ title: 'today', ...at('2025-10-07T12:00:00.000Z') }),
      makeTask({ title: 'overdue old', ...at('2025-10-01T05:00:00.000Z') }),
      makeTask({ title: 'upcoming 1', ...at('2025-10-08T05:00:00.000Z') }),
      makeTask({ title: 'overdue new', ...at('2025-10-05T05:00:00.000Z') }),
      makeTask({ title: 'no date' }),
      makeTask({ title: 'done', status: 'done', ...at('2025-10-07T05:00:00.000Z') }),
      makeTask({
        title: 'archived',
        archivedAt: '2025-10-02T00:00:00.000Z',
        ...at('2025-10-07T05:00:00.000Z'),
      }),
    ];
    expect(dueSoon(tasks, now).map((t) => t.title)).toEqual([
      'overdue old',
      'overdue new',
      'today',
      'upcoming 1',
      'upcoming 2',
    ]);
    expect(dueSoon(tasks, now, 2)).toHaveLength(2);
  });
});

describe('inboxTasks', () => {
  it('is open top-level tasks with no due date and no tags', () => {
    const tagged = makeTask({
      tags: [{ id: '00000000-0000-4000-8000-0000000000bb', name: 'x', color: '#F7D96B' }],
    });
    const tasks = [
      makeTask({ title: 'inbox' }),
      tagged,
      makeTask(at('2025-10-08T00:00:00.000Z')),
      makeTask({ status: 'done' }),
      makeTask({ archivedAt: '2025-10-01T00:00:00.000Z' }),
    ];
    expect(inboxTasks(tasks).map((t) => t.title)).toEqual(['inbox']);
  });
});
