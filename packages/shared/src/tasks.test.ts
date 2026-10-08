import { describe, expect, it } from 'vitest';
import { CONFIRMATION_LEVELS } from './actions';
import { createTaskInput, listTasksInput, taskActions, taskSchema, updateTaskInput } from './tasks';

const ID = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';

describe('createTaskInput', () => {
  it('trims the title and accepts the optional fields', () => {
    const parsed = createTaskInput.parse({
      title: '  Buy milk ',
      priority: 2,
      dueAt: '2025-10-07T11:30:00+05:30',
    });
    expect(parsed.title).toBe('Buy milk');
  });

  it.each([
    [{}],
    [{ title: ' ' }],
    [{ title: 'x', priority: 5 }],
    [{ title: 'x', status: 'later' }],
    [{ title: 'x', dueAt: '2025-10-07' }],
  ])('refuses %j', (input) => {
    expect(createTaskInput.safeParse(input).success).toBe(false);
  });

  it('does not accept a user id or other fields to be passed through', () => {
    const parsed = createTaskInput.parse({ title: 'x', userId: ID, id: ID });
    expect(parsed).toEqual({ title: 'x' });
  });
});

describe('updateTaskInput', () => {
  it('needs an id and at least one field', () => {
    expect(updateTaskInput.safeParse({ id: ID }).success).toBe(false);
    expect(updateTaskInput.safeParse({ id: ID, title: 'x' }).success).toBe(true);
    expect(updateTaskInput.safeParse({ id: ID, dueAt: null }).success).toBe(true);
    expect(updateTaskInput.safeParse({ title: 'x' }).success).toBe(false);
  });
});

describe('listTasksInput', () => {
  it('has defaults', () => {
    expect(listTasksInput.parse({})).toEqual({
      parent: 'none',
      archived: false,
      sort: 'position',
      order: 'asc',
      limit: 500,
      offset: 0,
    });
  });

  it('accepts text values from a query string', () => {
    expect(listTasksInput.parse({ archived: 'true', limit: '20', offset: '5' })).toMatchObject({
      archived: true,
      limit: 20,
      offset: 5,
    });
  });
});

describe('taskSchema', () => {
  it('describes a task as the API returns it', () => {
    const task = {
      id: ID,
      title: 'x',
      description: null,
      status: 'todo',
      priority: 4,
      dueAt: null,
      dueAllDay: false,
      reminderAt: null,
      recurrenceRule: null,
      parentTaskId: null,
      position: 1024,
      completedAt: null,
      archivedAt: null,
      createdAt: '2025-10-07T00:00:00.000Z',
      updatedAt: '2025-10-07T00:00:00.000Z',
      tags: [],
      subtaskCount: 0,
      subtasksDone: 0,
      blockedBy: [],
    };
    expect(taskSchema.parse(task)).toEqual(task);
  });
});

describe('taskActions', () => {
  it('has the actions from docs/features/tasks.md, named tasks.*', () => {
    expect(Object.values(taskActions).map((action) => action.name)).toEqual([
      'tasks.list',
      'tasks.get',
      'tasks.create',
      'tasks.update',
      'tasks.archive',
      'tasks.unarchive',
      'tasks.complete',
      'tasks.move',
      'tasks.prioritize',
      'tasks.delete',
      'tasks.restore',
    ]);
  });

  it('only deleting needs a confirmation', () => {
    const needing = Object.values(taskActions).filter((action) =>
      CONFIRMATION_LEVELS.includes(action.permission),
    );
    expect(needing.map((action) => action.name)).toEqual(['tasks.delete']);
  });
});
