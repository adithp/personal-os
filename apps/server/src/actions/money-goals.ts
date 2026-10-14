import { savingsGoals } from '@personal-os/db';
import { financeActions, MAX_PAISE } from '@personal-os/shared';
import { asc } from 'drizzle-orm';
import { withUserLock } from '../lib/user-lock';
import {
  changes,
  DEFAULT_COLOR,
  findAny,
  findLive,
  invalid,
  notFound,
  softDeleteLive,
  toGoal,
  undelete,
  updateLive,
} from './money-common';
import { implement } from './registry';

/** Savings goals (docs/features/money.md): saved vs target, with contribute for adding money. */

export const goalImplementations = [
  implement(financeActions.goalsList, async ({ scope }) => {
    const rows = await scope.select(savingsGoals, {
      where: scope.isLive(savingsGoals),
      orderBy: [asc(savingsGoals.createdAt), asc(savingsGoals.id)],
    });
    return { data: rows.map(toGoal) };
  }),

  implement(financeActions.goalsCreate, async ({ scope }, input) => {
    const [row] = await scope.insert(savingsGoals, {
      name: input.name,
      targetPaise: input.targetPaise,
      savedPaise: input.savedPaise,
      targetOn: input.targetOn ?? null,
      color: input.color ?? DEFAULT_COLOR,
    });
    if (!row) throw new Error('Could not create the savings goal');
    return { data: toGoal(row), undo: { action: 'finance.goals.delete', input: { id: row.id } } };
  }),

  implement(financeActions.goalsUpdate, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      const current = await findLive(tx, savingsGoals, input.id);
      if (!current) throw notFound('Savings goal');
      const { values, old } = changes(current, input, ['name', 'targetPaise', 'targetOn', 'color']);
      if (Object.keys(values).length === 0) return { data: toGoal(current), undo: null };
      const updated = await updateLive(tx, savingsGoals, input.id, values);
      if (!updated) throw notFound('Savings goal');
      return {
        data: toGoal(updated),
        undo: { action: 'finance.goals.update', input: { id: input.id, ...old } },
      };
    }),
  ),

  implement(financeActions.goalsContribute, ({ scope }, { id, deltaPaise }) =>
    withUserLock('money-goals', scope.userId, () =>
      scope.transaction(async (tx) => {
        const current = await findLive(tx, savingsGoals, id);
        if (!current) throw notFound('Savings goal');
        const saved = current.savedPaise + deltaPaise;
        if (saved < 0) throw invalid('You cannot take out more than is saved');
        if (saved > MAX_PAISE) throw invalid('That amount is too large');
        const updated = await updateLive(tx, savingsGoals, id, { savedPaise: saved });
        if (!updated) throw notFound('Savings goal');
        return {
          data: toGoal(updated),
          undo: { action: 'finance.goals.contribute', input: { id, deltaPaise: -deltaPaise } },
        };
      }),
    ),
  ),

  implement(financeActions.goalsDelete, async ({ scope }, { id }) => {
    const deleted = await softDeleteLive(scope, savingsGoals, id);
    if (!deleted) throw notFound('Savings goal');
    return { data: toGoal(deleted), undo: { action: 'finance.goals.restore', input: { id } } };
  }),

  implement(financeActions.goalsRestore, async ({ scope }, { id }) => {
    const current = await findAny(scope, savingsGoals, id);
    if (!current) throw notFound('Savings goal');
    if (current.deletedAt === null) return { data: toGoal(current), undo: null };
    const restored = await undelete(scope, savingsGoals, id);
    if (!restored) throw notFound('Savings goal');
    return { data: toGoal(restored), undo: { action: 'finance.goals.delete', input: { id } } };
  }),
];
