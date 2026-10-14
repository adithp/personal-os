import type { Goal, Task } from '@personal-os/shared';
import { screen, waitFor } from '@testing-library/react';
import { createFakeApi, makeGoal, makeTask, type FakeApi } from '../../../../test/fake-api';
import { openMyTasks } from '../../my-tasks/test-utils';

/** What a task carries about its goal. */
export const inGoal = (goal: Goal) => ({ id: goal.id, title: goal.title });

export interface GoalSetup {
  goal: Goal;
  fake: FakeApi;
}

/** A goal and its tasks in the mock API. `tasks` gets the goal so it can link its tasks to it. */
export function goalWith(
  goalOverrides: Partial<Goal> = {},
  tasks: (goal: Goal) => Task[] = () => [],
  others: Task[] = [],
  moreGoals: Goal[] = [],
): GoalSetup {
  const goal = makeGoal({ title: 'Learn Rust', ...goalOverrides });
  const fake = createFakeApi([...tasks(goal), ...others], [], [], [goal, ...moreGoals]);
  return { goal, fake };
}

/** Opens the goal page and waits for the title. */
export async function openGoal({ goal, fake }: GoalSetup) {
  const opened = await openMyTasks(fake, `/tasks/goals/${goal.id}`);
  await screen.findByRole('textbox', { name: 'Goal title' });
  return opened;
}

export const done = (title: string, goal: Goal, extra: Partial<Task> = {}) =>
  makeTask({
    title,
    status: 'done',
    completedAt: '2025-10-06T09:30:00.000Z',
    goal: inGoal(goal),
    ...extra,
  });
export const todo = (title: string, goal: Goal, extra: Partial<Task> = {}) =>
  makeTask({ title, goal: inGoal(goal), ...extra });

export const callsTo = (fake: FakeApi, method: string, path: string) =>
  fake.calls.filter((call) => call.method === method && call.path === path);

/** The goal as the mock API holds it now. */
export const serverGoal = async (fake: FakeApi, id: string) =>
  (await fake.api.request<{ item: Goal }>('GET', `/goals/${id}`)).item;

/** Waits until the page shows the tasks (the list calls were answered). */
export const idle = () => waitFor(() => screen.getByRole('region', { name: 'Tasks' }));
