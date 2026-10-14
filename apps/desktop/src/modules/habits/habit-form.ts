import {
  HABIT_CUSTOM_DAYS_MAX,
  HABIT_TARGET_MAX,
  type CreateHabitInput,
  type Habit,
  type HabitSchedule,
  type UpdateHabitInput,
} from '@personal-os/shared';

export type ScheduleType = HabitSchedule['type'];

/** What the create / edit dialog edits. Numbers stay text while typing. */
export interface HabitForm {
  name: string;
  category: string;
  scheduleType: ScheduleType;
  days: number[];
  everyDays: string;
  target: string;
  reminderTime: string;
  color: string | null;
  notes: string;
}

export const EMPTY_FORM: HabitForm = {
  name: '',
  category: '',
  scheduleType: 'daily',
  days: [1, 2, 3, 4, 5],
  everyDays: '2',
  target: '1',
  reminderTime: '',
  color: null,
  notes: '',
};

export function formOf(habit: Habit): HabitForm {
  return {
    name: habit.name,
    category: habit.category ?? '',
    scheduleType: habit.schedule.type,
    days: habit.schedule.type === 'weekly' ? habit.schedule.days : EMPTY_FORM.days,
    everyDays: habit.schedule.type === 'custom' ? String(habit.schedule.everyDays) : '2',
    target: String(habit.target),
    reminderTime: habit.reminderTime ?? '',
    color: habit.color,
    notes: habit.notes,
  };
}

export interface HabitFields {
  name: string;
  category: string | null;
  schedule: HabitSchedule;
  target: number;
  reminderTime: string | null;
  color: string | null;
  notes: string;
}

/** The checked fields of a form, or the first problem to show. */
export function readForm(form: HabitForm): { fields: HabitFields } | { error: string } {
  const name = form.name.trim();
  if (name === '') return { error: 'Add a name' };
  const target = Number(form.target);
  if (!Number.isInteger(target) || target < 1 || target > HABIT_TARGET_MAX) {
    return { error: `Target must be a whole number from 1 to ${String(HABIT_TARGET_MAX)}` };
  }
  let schedule: HabitSchedule;
  if (form.scheduleType === 'weekly') {
    if (form.days.length === 0) return { error: 'Pick at least one day' };
    schedule = { type: 'weekly', days: [...form.days].sort((a, b) => a - b) };
  } else if (form.scheduleType === 'custom') {
    const everyDays = Number(form.everyDays);
    if (!Number.isInteger(everyDays) || everyDays < 2 || everyDays > HABIT_CUSTOM_DAYS_MAX) {
      return { error: `Every N days: a whole number from 2 to ${String(HABIT_CUSTOM_DAYS_MAX)}` };
    }
    schedule = { type: 'custom', everyDays };
  } else {
    schedule = { type: 'daily' };
  }
  return {
    fields: {
      name,
      category: form.category.trim() === '' ? null : form.category.trim(),
      schedule,
      target,
      reminderTime: form.reminderTime === '' ? null : form.reminderTime,
      color: form.color,
      notes: form.notes,
    },
  };
}

export const createInputOf = (fields: HabitFields): CreateHabitInput => fields;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only the fields that differ from the habit (the server refuses an empty change). */
export function patchOf(habit: Habit, fields: HabitFields): Omit<UpdateHabitInput, 'id'> {
  const before: HabitFields = {
    name: habit.name,
    category: habit.category,
    schedule: habit.schedule,
    target: habit.target,
    reminderTime: habit.reminderTime,
    color: habit.color,
    notes: habit.notes,
  };
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(before) as (keyof HabitFields)[]) {
    if (!same(before[key], fields[key])) patch[key] = fields[key];
  }
  return patch;
}
