import type * as TauriWindow from '@tauri-apps/api/window';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../../../test/fake-api';
import { resetEverything, restoreEverything } from '../../my-tasks/test-utils';
import { useGoalPrompts } from '../prompt-store';
import { callsTo, done, goalWith, openGoal, todo } from './goal-test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../../detail/task-detail-panel', () => ({
  TaskDetailPanel: ({ taskId }: { taskId: string }) => <aside data-testid="detail">{taskId}</aside>,
}));

beforeEach(() => {
  resetEverything();
  useGoalPrompts.setState({ dismissed: {} });
});
afterEach(restoreEverything);

const title = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Goal title' });
const notes = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Notes' });
const addBox = () => screen.getByRole('textbox', { name: 'Add a task to this goal' });
const popover = () => screen.getByRole('dialog', { name: 'Add tasks to this goal' });

describe('the More menu', () => {
  it('lines up with the right edge of its button so it stays inside the column', async () => {
    const { user } = await openGoal(goalWith());
    await user.click(screen.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu', { name: 'Goal actions' });
    expect(menu).toHaveClass('right-0');
    expect(menu).not.toHaveClass('left-0');
  });
});

describe('the target date focus', () => {
  const targetAt = '2025-12-30T18:30:00.000Z';

  it('returns to the "By" button after Enter', async () => {
    const { user } = await openGoal(goalWith({ targetAt }));
    await user.click(screen.getByRole('button', { name: 'By 31 Dec' }));
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2025-12-31' } });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'By 31 Dec' })).toHaveFocus();
    });
  });

  it('returns to the "By" button after Escape', async () => {
    const { user } = await openGoal(goalWith({ targetAt }));
    await user.click(screen.getByRole('button', { name: 'By 31 Dec' }));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'By 31 Dec' })).toHaveFocus();
    });
  });
});

describe('saving title and notes', () => {
  it('drops the typed title when the save fails', async () => {
    const setup = goalWith({ title: 'Learn Rust' });
    const { user, fake } = await openGoal(setup);
    fake.failNext(500, 'server_error', 'Could not save', `/goals/${setup.goal.id}`);
    await user.type(title(), ' more{Enter}');
    await waitFor(() => {
      expect(title()).toHaveValue('Learn Rust');
    });
  });

  it('drops the typed notes when the save fails', async () => {
    const setup = goalWith({ description: null });
    const { user, fake } = await openGoal(setup);
    fake.failNext(500, 'server_error', 'Could not save', `/goals/${setup.goal.id}`);
    await user.type(notes(), 'Plan');
    await user.tab();
    await waitFor(() => {
      expect(notes()).toHaveValue('');
    });
  });

  it('saves the notes on Escape instead of discarding them', async () => {
    const setup = goalWith({ description: null });
    const { user, fake } = await openGoal(setup);
    await user.type(notes(), 'Plan');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)[0]?.body).toEqual({
        description: 'Plan',
      });
    });
  });

  it('saves a title being edited when the page closes', async () => {
    const setup = goalWith({ title: 'Learn Rust' });
    const { user, fake, router } = await openGoal(setup);
    await user.type(title(), ' fast');
    await router.navigate({ to: '/tasks/goals' });
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)[0]?.body).toEqual({
        title: 'Learn Rust fast',
      });
    });
  });
});

describe('the tasks card', () => {
  it('keeps the typed title when creating the task fails', async () => {
    const setup = goalWith({}, (goal) => [todo('a', goal)]);
    const { user, fake } = await openGoal(setup);
    await screen.findByRole('checkbox', { name: 'Complete: a' });
    fake.failNext(409, 'goal_full', 'This goal has too many tasks', '/tasks');
    await user.type(addBox(), 'One more{Enter}');
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/tasks')).toHaveLength(1);
    });
    expect(addBox()).toHaveValue('One more');
  });

  it('clears the typed title once the task was created', async () => {
    const { user } = await openGoal(goalWith());
    await user.type(addBox(), 'Fresh{Enter}');
    await waitFor(() => {
      expect(addBox()).toHaveValue('');
    });
  });

  it('names the Done group list', async () => {
    const { user } = await openGoal(goalWith({}, (goal) => [done('Finished', goal)]));
    await user.click(await screen.findByRole('button', { name: /^Done/ }));
    expect(screen.getByRole('list', { name: 'Done' })).toBeInTheDocument();
  });
});

describe('the Add tasks popover', () => {
  const open = async (user: Awaited<ReturnType<typeof openGoal>>['user']) => {
    await user.click(screen.getByRole('button', { name: 'Add tasks' }));
    return within(popover()).findByRole('textbox', { name: 'Search open tasks' });
  };

  it('Enter does not unlink a first match that is already linked', async () => {
    const setup = goalWith({}, (goal) => [todo('Linked task', goal)]);
    const { user, fake } = await openGoal(setup);
    await open(user);
    await user.keyboard('{Enter}');
    expect(callsTo(fake, 'PUT', `/tasks/${fake.tasks()[0]?.id ?? ''}/goal`)).toHaveLength(0);
  });

  it('Enter links a first match that is not linked yet', async () => {
    const other = makeTask({ title: 'Loose task' });
    const setup = goalWith({}, () => [], [other]);
    const { user, fake } = await openGoal(setup);
    await open(user);
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(callsTo(fake, 'PUT', `/tasks/${other.id}/goal`)).toHaveLength(1);
    });
  });

  it('Tab closes it and puts focus back on the Add tasks button', async () => {
    const { user } = await openGoal(goalWith({}, (goal) => [todo('a', goal)]));
    await open(user);
    await user.tab();
    expect(screen.queryByRole('dialog', { name: 'Add tasks to this goal' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add tasks' })).toHaveFocus();
  });
});

describe('progress and the achieve prompt', () => {
  it('gives the progress bar a spoken value', async () => {
    await openGoal(goalWith({}, (goal) => [done('a', goal), todo('b', goal)]));
    const bar = await screen.findByRole('progressbar', { name: 'Tasks done' });
    expect(bar).toHaveAttribute('aria-valuetext', '1 of 2 tasks');
  });

  it('puts the prompt inside a status region that is always there', async () => {
    await openGoal(goalWith({}, (goal) => [done('a', goal), done('b', goal)]));
    const prompt = await screen.findByRole('region', { name: 'Goal finished' });
    expect(prompt.closest('[role="status"]')).not.toBeNull();
  });
});
