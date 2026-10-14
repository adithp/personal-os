import type { Habit } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { makeHabit } from '../../test/fake-habits';
import { EMPTY_FORM, formOf, patchOf, readForm } from './habit-form';

const view = (overrides: Partial<Habit> = {}): Habit => ({
  ...makeHabit(),
  today: { date: '2025-10-07', scheduled: true, count: 0, done: false },
  currentStreak: 0,
  bestStreak: 0,
  atRisk: false,
  ...overrides,
});

describe('readForm', () => {
  const ok = (form: Partial<typeof EMPTY_FORM>) =>
    readForm({ ...EMPTY_FORM, name: 'Run', ...form });

  it('needs a name', () => {
    expect(ok({ name: '  ' })).toEqual({ error: 'Add a name' });
  });

  it('builds a daily habit with trimmed text', () => {
    expect(ok({ name: ' Run ', category: ' Health ' })).toEqual({
      fields: {
        name: 'Run',
        category: 'Health',
        schedule: { type: 'daily' },
        target: 1,
        reminderTime: null,
        color: null,
        notes: '',
      },
    });
  });

  it('needs at least one weekday for a weekly habit and sorts them', () => {
    expect(ok({ scheduleType: 'weekly', days: [] })).toEqual({ error: 'Pick at least one day' });
    expect(ok({ scheduleType: 'weekly', days: [5, 1] })).toMatchObject({
      fields: { schedule: { type: 'weekly', days: [1, 5] } },
    });
  });

  it('checks every N days and the target', () => {
    expect(ok({ scheduleType: 'custom', everyDays: '1' })).toHaveProperty('error');
    expect(ok({ scheduleType: 'custom', everyDays: '3' })).toMatchObject({
      fields: { schedule: { type: 'custom', everyDays: 3 } },
    });
    expect(ok({ target: '0' })).toHaveProperty('error');
    expect(ok({ target: '2.5' })).toHaveProperty('error');
    expect(ok({ target: '8', reminderTime: '07:30' })).toMatchObject({
      fields: { target: 8, reminderTime: '07:30' },
    });
  });
});

describe('patchOf', () => {
  it('holds only the changed fields, none when nothing changed', () => {
    const habit = view({ name: 'Read', category: 'Learning', target: 2 });
    const same = readForm(formOf(habit));
    if (!('fields' in same)) throw new Error('form should be valid');
    expect(patchOf(habit, same.fields)).toEqual({});
    expect(patchOf(habit, { ...same.fields, name: 'Read more', color: '#F4A9C4' })).toEqual({
      name: 'Read more',
      color: '#F4A9C4',
    });
  });
});
