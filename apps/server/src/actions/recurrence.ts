import { entities, entityTags, tasks, type TaskRow } from '@personal-os/db';
import { parseRecurrence, taskActions, type Recurrence } from '@personal-os/shared';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { RRule, type Options } from 'rrule';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';
import { applyChange, POSITION_STEP } from './tasks';

/** India is UTC+05:30 all year (no daylight saving), so a fixed offset is exact. */
const IST_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * rrule has no time zones: it reads the UTC parts of a date and returns dates the same way. So
 * every date goes in as "floating UTC": its UTC parts are the India wall-clock parts.
 */
const toFloating = (real: Date) => new Date(real.getTime() + IST_MS);
const fromFloating = (floating: Date) => new Date(floating.getTime() - IST_MS);

const WEEKDAY_RULES = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

/** The rrule options for a preset, starting from the old due date (floating UTC). */
function optionsFor(recurrence: Recurrence, start: Date): Partial<Options> {
  switch (recurrence.freq) {
    case 'daily':
      return { freq: RRule.DAILY };
    case 'weekly':
      return { freq: RRule.WEEKLY, byweekday: recurrence.days.map((day) => WEEKDAY_RULES[day]) };
    case 'monthly':
      // Day 29, 30 or 31: also match the last day of the month, and take the earliest match
      return recurrence.day >= 29
        ? { freq: RRule.MONTHLY, bymonthday: [recurrence.day, -1], bysetpos: 1 }
        : { freq: RRule.MONTHLY, bymonthday: recurrence.day };
    case 'yearly':
      // 29 February: in other years use the last day of February
      return start.getUTCMonth() === 1 && start.getUTCDate() === 29
        ? { freq: RRule.YEARLY, bymonth: 2, bymonthday: [29, -1], bysetpos: 1 }
        : { freq: RRule.YEARLY };
  }
}

/**
 * The first occurrence of the rule strictly after both the old due date and `now`, keeping the
 * time of day of the old due date (India time). Null when the rule is not a preset.
 */
export function nextDueDate(rule: string, dueAt: Date, now: Date): Date | null {
  const recurrence = parseRecurrence(rule);
  if (!recurrence) return null;
  const start = toFloating(dueAt);
  const after = toFloating(new Date(Math.max(dueAt.getTime(), now.getTime())));
  const next = new RRule({ ...optionsFor(recurrence, start), dtstart: start }).after(after, false);
  return next ? fromFloating(next) : null;
}

/** The position after the last live task with the same parent. */
async function positionAfterLast(scope: UserScope, parentTaskId: string | null): Promise<number> {
  const [last] = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      parentTaskId ? eq(tasks.parentTaskId, parentTaskId) : isNull(tasks.parentTaskId),
    ),
    orderBy: desc(tasks.position),
    limit: 1,
  });
  return (last?.position ?? 0) + POSITION_STEP;
}

/**
 * Called when a task with a recurrence rule has just been completed. Creates the next copy, due
 * on the first occurrence of the rule after both the old due date and `now` (Asia/Kolkata), and
 * returns it, or returns null when the task does not repeat. Subtasks are not copied.
 */
export async function spawnNextOccurrence(
  scope: UserScope,
  completed: TaskRow,
  now: Date,
): Promise<TaskRow | null> {
  if (!completed.recurrenceRule || !completed.dueAt) return null;
  const dueAt = nextDueDate(completed.recurrenceRule, completed.dueAt, now);
  if (!dueAt) return null;
  const reminderAt = completed.reminderAt
    ? new Date(dueAt.getTime() + (completed.reminderAt.getTime() - completed.dueAt.getTime()))
    : null;

  return scope.transaction(async (tx) => {
    const [entity] = await tx.insert(entities, { type: 'task', title: completed.title });
    if (!entity) throw new Error('Could not create the next task');
    const [copy] = await tx.insert(tasks, {
      id: entity.id,
      title: completed.title,
      description: completed.description,
      status: 'todo',
      priority: completed.priority,
      dueAt,
      dueAllDay: completed.dueAllDay,
      reminderAt,
      recurrenceRule: completed.recurrenceRule,
      parentTaskId: completed.parentTaskId,
      position: await positionAfterLast(tx, completed.parentTaskId),
    });
    if (!copy) throw new Error('Could not create the next task');
    const links = await tx.select(entityTags, { where: eq(entityTags.entityId, completed.id) });
    if (links.length > 0) {
      await tx.insert(
        entityTags,
        links.map((link) => ({ entityId: copy.id, tagId: link.tagId })),
      );
    }
    return copy;
  });
}

/**
 * tasks.reopen (the undo of completing a repeating task): restores the old values through
 * applyChange in tasks.ts and soft-deletes the copies in `removeIds` that are not done, in one
 * transaction. Its own undo is null.
 */
export const recurrenceImplementations = [
  implement(taskActions.reopen, async ({ scope }, { id, removeIds, ...patch }) =>
    scope.transaction(async (tx) => {
      const { data } = await applyChange(tx, id, patch);
      // Only the user's own live copies that are not done; anything else is left alone
      const copies = removeIds.filter((copyId) => copyId !== id);
      if (copies.length > 0) {
        const found = await tx.select(tasks, {
          where: and(inArray(tasks.id, copies), tx.isLive(tasks), ne(tasks.status, 'done')),
        });
        const ids = found.map((row) => row.id);
        if (ids.length > 0) {
          await tx.softDelete(tasks, inArray(tasks.id, ids));
          await tx.softDelete(entities, inArray(entities.id, ids));
        }
      }
      return { data, undo: null };
    }),
  ),
];
