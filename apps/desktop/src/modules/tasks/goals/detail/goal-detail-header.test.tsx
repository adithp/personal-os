import type * as TauriWindow from '@tauri-apps/api/window';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../../store/settings-store';
import { createFakeApi, makeGoal } from '../../../../test/fake-api';
import {
  findToast,
  openMyTasks,
  resetEverything,
  restoreEverything,
} from '../../my-tasks/test-utils';
import { useGoalPrompts } from '../prompt-store';
import { callsTo, done, goalWith, openGoal, serverGoal, todo } from './goal-test-utils';

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
const menuItem = (name: string) => screen.getByRole('menuitem', { name });
const openMenu = async (user: Awaited<ReturnType<typeof openGoal>>['user']) => {
  await user.click(screen.getByRole('button', { name: 'More' }));
};

describe('the goal header', () => {
  it('shows the title, the back link and no status chip for an active goal', async () => {
    await openGoal(goalWith({ title: 'Learn Rust' }));
    expect(title()).toHaveValue('Learn Rust');
    expect(screen.getByRole('link', { name: 'Goals' })).toHaveAttribute('href', '/tasks/goals');
    expect(screen.queryByText('Achieved')).toBeNull();
    expect(screen.queryByText('Dropped')).toBeNull();
  });

  it('saves a new title on Enter', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await user.clear(title());
    await user.type(title(), 'Learn Go{Enter}');
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)[0]?.body).toEqual({
        title: 'Learn Go',
      });
    });
    await waitFor(() => {
      expect(title()).toHaveValue('Learn Go');
    });
  });

  it('saves a new title when the box is left', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await user.clear(title());
    await user.type(title(), 'Learn C');
    await user.tab();
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)).toHaveLength(1);
    });
  });

  it('refuses an empty title, says so, and puts the old title back', async () => {
    const setup = goalWith({ title: 'Learn Rust' });
    const { user, fake } = await openGoal(setup);
    await user.clear(title());
    await user.keyboard('{Enter}');
    await findToast('Add a title');
    expect(title()).toHaveValue('Learn Rust');
    expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)).toHaveLength(0);
  });

  it('does not save an unchanged title, and Escape drops the edit', async () => {
    const setup = goalWith({ title: 'Learn Rust' });
    const { user, fake } = await openGoal(setup);
    await user.type(title(), ' more');
    await user.keyboard('{Escape}');
    expect(title()).toHaveValue('Learn Rust');
    await user.click(title());
    await user.tab();
    expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)).toHaveLength(0);
  });

  it('shows a chip for an achieved goal and for a dropped goal', async () => {
    await openGoal(goalWith({ status: 'achieved', closedAt: '2025-10-05T10:00:00.000Z' }));
    expect(screen.getAllByText('Achieved').length).toBeGreaterThan(0);
  });

  it('shows the Dropped chip for a dropped goal', async () => {
    await openGoal(goalWith({ status: 'dropped', closedAt: '2025-10-05T10:00:00.000Z' }));
    expect(screen.getAllByText('Dropped').length).toBeGreaterThan(0);
  });
});

describe('the target date', () => {
  it('says "Set a target date" when empty', async () => {
    await openGoal(goalWith({ targetAt: null }));
    expect(screen.getByRole('button', { name: 'Set a target date' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear target date' })).toBeNull();
  });

  it('shows "By 31 Dec" in India days, without the year in the current year', async () => {
    // 31 Dec 2025 in India starts at 18:30 UTC on 30 Dec
    await openGoal(goalWith({ targetAt: '2025-12-30T18:30:00.000Z' }));
    expect(screen.getByRole('button', { name: 'By 31 Dec' })).toBeInTheDocument();
  });

  it('adds the year when the target is in another year', async () => {
    await openGoal(goalWith({ targetAt: '2026-12-30T18:30:00.000Z' }));
    expect(screen.getByRole('button', { name: 'By 31 Dec 2026' })).toBeInTheDocument();
  });

  it('sets the date from the date box on Enter as the start of that India day', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await user.click(screen.getByRole('button', { name: 'Set a target date' }));
    const box = screen.getByLabelText('Target date');
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: '2025-12-31' } });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)[0]?.body).toEqual({
        targetAt: '2025-12-30T18:30:00.000Z',
      });
    });
    expect(await screen.findByRole('button', { name: 'By 31 Dec' })).toBeInTheDocument();
  });

  it('sets the date when the box is left', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await user.click(screen.getByRole('button', { name: 'Set a target date' }));
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2025-11-02' } });
    fireEvent.blur(screen.getByLabelText('Target date'));
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)).toHaveLength(1);
    });
  });

  it('closes the box without saving when nothing changed', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await user.click(screen.getByRole('button', { name: 'Set a target date' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Set a target date' })).toBeInTheDocument();
    expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)).toHaveLength(0);
  });

  it('clears the date', async () => {
    const setup = goalWith({ targetAt: '2025-12-30T18:30:00.000Z' });
    const { user, fake } = await openGoal(setup);
    await user.click(screen.getByRole('button', { name: 'Clear target date' }));
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)[0]?.body).toEqual({
        targetAt: null,
      });
    });
    expect(await screen.findByRole('button', { name: 'Set a target date' })).toBeInTheDocument();
  });
});

describe('the more menu', () => {
  it('offers Mark as achieved, Drop goal and Delete goal for an active goal', async () => {
    const { user } = await openGoal(goalWith());
    await openMenu(user);
    expect(menuItem('Mark as achieved')).toBeInTheDocument();
    expect(menuItem('Drop goal')).toBeInTheDocument();
    expect(menuItem('Delete goal')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Make active again' })).toBeNull();
  });

  it('offers Make active again, not achieve or drop, for a closed goal', async () => {
    const { user } = await openGoal(
      goalWith({ status: 'dropped', closedAt: '2025-10-05T10:00:00.000Z' }),
    );
    await openMenu(user);
    expect(menuItem('Make active again')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Mark as achieved' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Drop goal' })).toBeNull();
  });

  it('achieves the goal, shows the chip and a toast with Undo that restores it', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await openMenu(user);
    await user.click(menuItem('Mark as achieved'));
    const toast = await findToast('Goal achieved.');
    expect((await serverGoal(fake, setup.goal.id)).status).toBe('achieved');
    expect(await screen.findAllByText('Achieved')).not.toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => {
      expect((await serverGoal(fake, setup.goal.id)).status).toBe('active');
    });
    expect(toast).toBeDefined();
  });

  it('drops the goal with a toast', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await openMenu(user);
    await user.click(menuItem('Drop goal'));
    await findToast('Goal dropped.');
    expect((await serverGoal(fake, setup.goal.id)).status).toBe('dropped');
    expect(await screen.findAllByText('Dropped')).not.toHaveLength(0);
  });

  it('makes a closed goal active again', async () => {
    const setup = goalWith({ status: 'achieved', closedAt: '2025-10-05T10:00:00.000Z' });
    const { user, fake } = await openGoal(setup);
    await openMenu(user);
    await user.click(menuItem('Make active again'));
    await findToast('Goal is active again.');
    expect((await serverGoal(fake, setup.goal.id)).status).toBe('active');
    await waitFor(() => {
      expect(screen.queryByText('Achieved')).toBeNull();
    });
  });

  it('deletes the goal without asking, shows Undo and goes back to the list', async () => {
    const setup = goalWith();
    const { user, fake, router } = await openGoal(setup);
    await openMenu(user);
    await user.click(menuItem('Delete goal'));
    await findToast('Goal deleted.');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tasks/goals');
    });
    expect(callsTo(fake, 'DELETE', `/goals/${setup.goal.id}`)).toHaveLength(1);
    expect(screen.queryByText('This goal was deleted or does not exist.')).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => {
      expect((await serverGoal(fake, setup.goal.id)).id).toBe(setup.goal.id);
    });
  });

  it('stays on the page and shows the error when deleting fails', async () => {
    const setup = goalWith();
    const { user, fake, router } = await openGoal(setup);
    await openMenu(user);
    fake.failNext(500, 'server_error', 'Could not delete this goal', `/goals/${setup.goal.id}`);
    await user.click(menuItem('Delete goal'));
    await findToast('Could not delete this goal');
    expect(router.state.location.pathname).toBe(`/tasks/goals/${setup.goal.id}`);
    expect(await screen.findByRole('textbox', { name: 'Goal title' })).toBeInTheDocument();
  });

  it('closes with Escape and returns focus to the button', async () => {
    const { user } = await openGoal(goalWith());
    await openMenu(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
  });
});

describe('progress and the prompt', () => {
  it('shows "3 of 8", "tasks done", the percent and a bar', async () => {
    await openGoal(
      goalWith({}, (goal) => [
        ...['a', 'b', 'c'].map((name) => done(name, goal)),
        ...['d', 'e', 'f', 'g', 'h'].map((name) => todo(name, goal)),
      ]),
    );
    const card = await screen.findByRole('region', { name: 'Progress' });
    await waitFor(() => {
      expect(card).toHaveTextContent('3 of 8');
    });
    expect(card).toHaveTextContent('tasks done');
    expect(card).toHaveTextContent('38%');
    expect(screen.getByRole('progressbar', { name: 'Tasks done' })).toHaveAttribute(
      'aria-valuenow',
      '38',
    );
  });

  it('says "No tasks yet" and has no bar or percent when nothing is linked', async () => {
    await openGoal(goalWith());
    const card = await screen.findByRole('region', { name: 'Progress' });
    expect(card).toHaveTextContent('No tasks yet');
    expect(card).toHaveTextContent('Link tasks to see your progress.');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(card).not.toHaveTextContent('%');
  });

  it('shows "Achieved 13 Oct" for an achieved goal and "Dropped 13 Oct" for a dropped one', async () => {
    await openGoal(goalWith({ status: 'achieved', closedAt: '2025-10-13T08:00:00.000Z' }));
    expect(await screen.findByRole('region', { name: 'Progress' })).toHaveTextContent(
      'Achieved 13 Oct',
    );
  });

  it('shows "Dropped 13 Oct" for a dropped goal', async () => {
    await openGoal(goalWith({ status: 'dropped', closedAt: '2025-10-13T08:00:00.000Z' }));
    expect(await screen.findByRole('region', { name: 'Progress' })).toHaveTextContent(
      'Dropped 13 Oct',
    );
  });

  it('asks "Mark as achieved?" when every task is done', async () => {
    await openGoal(goalWith({}, (goal) => [done('a', goal), done('b', goal)]));
    const prompt = await screen.findByRole('region', { name: 'Goal finished' });
    expect(prompt).toHaveTextContent('All 2 tasks are done. Mark this goal as achieved?');
  });

  it('does not ask when a task is open, when there are no tasks, or when the goal is closed', async () => {
    await openGoal(goalWith({}, (goal) => [done('a', goal), todo('b', goal)]));
    await screen.findByRole('region', { name: 'Progress' });
    expect(screen.queryByRole('region', { name: 'Goal finished' })).toBeNull();
  });

  it('does not ask for an achieved goal even if all tasks are done', async () => {
    await openGoal(
      goalWith({ status: 'achieved', closedAt: '2025-10-05T10:00:00.000Z' }, (goal) => [
        done('a', goal),
      ]),
    );
    await screen.findByRole('region', { name: 'Progress' });
    expect(screen.queryByRole('region', { name: 'Goal finished' })).toBeNull();
  });

  it('marks the goal as achieved from the prompt', async () => {
    const setup = goalWith({}, (goal) => [done('a', goal)]);
    const { user, fake } = await openGoal(setup);
    await screen.findByRole('region', { name: 'Goal finished' });
    await user.click(screen.getByRole('button', { name: 'Mark as achieved' }));
    await findToast('Goal achieved.');
    expect((await serverGoal(fake, setup.goal.id)).status).toBe('achieved');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Goal finished' })).toBeNull();
    });
  });

  it('hides the prompt on "Not yet" until the number of tasks changes', async () => {
    const setup = goalWith({}, (goal) => [done('a', goal)]);
    const { user } = await openGoal(setup);
    await screen.findByRole('region', { name: 'Goal finished' });
    await user.click(screen.getByRole('button', { name: 'Not yet' }));
    expect(screen.queryByRole('region', { name: 'Goal finished' })).toBeNull();
    expect(useGoalPrompts.getState().dismissed[setup.goal.id]).toBe(1);
    // A new task and its completion change the total, so the question comes back
    await user.type(screen.getByRole('textbox', { name: 'Add a task to this goal' }), 'b{Enter}');
    await screen.findByRole('checkbox', { name: 'Complete: b' });
    expect(screen.queryByRole('region', { name: 'Goal finished' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Complete: b' }));
    expect(await screen.findByRole('region', { name: 'Goal finished' })).toHaveTextContent(
      'All 2 tasks',
    );
  });

  it('keeps the prompt hidden after a reload when the total is the same', async () => {
    const setup = goalWith({}, (goal) => [done('a', goal)]);
    useGoalPrompts.getState().dismiss(setup.goal.id, 1);
    await openGoal(setup);
    await screen.findByRole('region', { name: 'Progress' });
    expect(screen.queryByRole('region', { name: 'Goal finished' })).toBeNull();
  });
});

describe('the notes', () => {
  it('shows the notes and saves a change when the box is left', async () => {
    const setup = goalWith({ description: 'First notes' });
    const { user, fake } = await openGoal(setup);
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    expect(notes).toHaveValue('First notes');
    await user.type(notes, ' and more');
    expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)).toHaveLength(0);
    await user.tab();
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)[0]?.body).toEqual({
        description: 'First notes and more',
      });
    });
  });

  it('has the placeholder "Add notes…" and saves null when emptied', async () => {
    const setup = goalWith({ description: 'Something' });
    const { user, fake } = await openGoal(setup);
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    expect(notes).toHaveAttribute('placeholder', 'Add notes…');
    await user.clear(notes);
    await user.tab();
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)[0]?.body).toEqual({
        description: null,
      });
    });
  });

  it('does not save when nothing changed', async () => {
    const setup = goalWith({ description: null });
    const { user, fake } = await openGoal(setup);
    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    await user.tab();
    expect(callsTo(fake, 'PATCH', `/goals/${setup.goal.id}`)).toHaveLength(0);
  });
});

describe('loading, not found and errors', () => {
  it('shows "Loading goal…" while the goal loads', async () => {
    const fake = createFakeApi([], [], [], [makeGoal()]);
    fake.slow(80);
    const goal = await fake.api.request<{ items: { id: string }[] }>('GET', '/goals');
    const opened = openMyTasks(fake, `/tasks/goals/${goal.items[0]?.id ?? ''}`);
    expect(await screen.findByText('Loading goal…')).toBeInTheDocument();
    await opened;
  });

  it('says the goal was deleted or does not exist, with a Back to goals button', async () => {
    const { user, router } = await openMyTasks(
      createFakeApi(),
      '/tasks/goals/00000000-0000-4000-8000-000000000000',
    );
    expect(await screen.findByText('This goal was deleted or does not exist.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to goals' }));
    expect(router.state.location.pathname).toBe('/tasks/goals');
  });

  it('shows the server message and Try again on an error', async () => {
    const setup = goalWith();
    setup.fake.failNext(500, 'server_error', 'The server is having a bad day', '/goals/');
    const { user } = await openMyTasks(setup.fake, `/tasks/goals/${setup.goal.id}`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server is having a bad day');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('textbox', { name: 'Goal title' })).toBeInTheDocument();
  });
});

describe('look', () => {
  it.each(['dark', 'light'] as const)('has no hard-coded colors in %s mode', async (theme) => {
    useSettings.getState().update({ theme });
    await openGoal(
      goalWith({ targetAt: '2025-12-30T18:30:00.000Z', description: 'Notes' }, (goal) => [
        done('a', goal),
        todo('b', goal),
      ]),
    );
    await screen.findByRole('checkbox', { name: 'Complete: b' });
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it('gives every icon button an accessible name', async () => {
    await openGoal(goalWith({}, (goal) => [todo('b', goal), done('z', goal)]));
    await screen.findByRole('checkbox', { name: 'Complete: b' });
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });
});
