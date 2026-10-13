import { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useToasts } from '../../../store/toast-store';
import { AppProviders } from '../../../api/providers';
import { createFakeApi, makeGoal, makeTask } from '../../../test/fake-api';
import { GoalSection } from './goal-section';
import { openLoaded, toastMessages } from './test-utils';

const learn = makeGoal({ title: 'Learn Rust' });
const fit = makeGoal({ title: 'Get fit' });

const goalOf = (goal: { id: string; title: string }) => ({ id: goal.id, title: goal.title });

describe('TaskDetailPanel: goal row', () => {
  it('shows the goal as a link chip to the goal page', async () => {
    const task = makeTask({ goal: goalOf(learn) });
    await openLoaded(createFakeApi([task], [], [], [learn]), task.id);
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn Rust' })).toHaveAttribute(
      'href',
      `/tasks/goals/${learn.id}`,
    );
  });

  it('opens the goal page with the router when the chip is clicked', async () => {
    const task = makeTask({ goal: goalOf(learn) });
    const fake = createFakeApi([task], [], [], [learn]);
    const root = createRootRoute({
      component: () => (
        <>
          <GoalSection task={task} />
          <Outlet />
        </>
      ),
    });
    const page = createRoute({
      getParentRoute: () => root,
      path: '/tasks/goals/$goalId',
      component: () => <p>Goal page</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(
      <AppProviders api={fake.api} queryClient={new QueryClient()}>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    await userEvent.click(await screen.findByRole('link', { name: 'Learn Rust' }));
    expect(await screen.findByText('Goal page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/tasks/goals/${learn.id}`);
  });

  it('shows No goal in muted text when the task has none', async () => {
    const task = makeTask();
    await openLoaded(createFakeApi([task], [], [], [learn]), task.id);
    expect(screen.getByText('No goal')).toHaveClass('text-fg-muted');
    expect(screen.queryByRole('link', { name: 'Learn Rust' })).not.toBeInTheDocument();
  });

  it('lists only the active goals, with No goal at the top and a check on the current one', async () => {
    const done = makeGoal({ title: 'Old goal', status: 'achieved' });
    const task = makeTask({ goal: goalOf(learn) });
    const { user } = await openLoaded(createFakeApi([task], [], [], [learn, fit, done]), task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    const menu = await screen.findByRole('menu', { name: 'Goals' });
    const items = await within(menu).findAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual(['No goal', 'Learn Rust', 'Get fit']);
    expect(within(menu).getByRole('menuitemradio', { name: 'Learn Rust' })).toBeChecked();
    expect(within(menu).queryByRole('searchbox')).not.toBeInTheDocument();
    expect(within(menu).queryByRole('textbox', { name: 'Search goals' })).not.toBeInTheDocument();
  });

  it('links the task to a goal and shows an Undo toast', async () => {
    const task = makeTask();
    const fake = createFakeApi([task], [], [], [learn, fit]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Learn Rust' }));
    await waitFor(() => {
      expect(
        fake.calls.some((c) => c.method === 'PUT' && c.path === `/tasks/${task.id}/goal`),
      ).toBe(true);
    });
    expect(fake.calls.find((c) => c.method === 'PUT')?.body).toEqual({ goalId: learn.id });
    expect(toastMessages()).toContain('Added to Learn Rust.');
    expect(useToasts.getState().toasts.at(-1)?.action?.label).toBe('Undo');
    expect(await screen.findByRole('link', { name: 'Learn Rust' })).toBeInTheDocument();
  });

  it('says Moved to when the task already had another goal', async () => {
    const task = makeTask({ goal: goalOf(learn) });
    const fake = createFakeApi([task], [], [], [learn, fit]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Get fit' }));
    await waitFor(() => {
      expect(toastMessages()).toContain('Moved to Get fit.');
    });
    expect(await screen.findByRole('link', { name: 'Get fit' })).toBeInTheDocument();
  });

  it('removes the task from its goal with No goal', async () => {
    const task = makeTask({ goal: goalOf(learn) });
    const fake = createFakeApi([task], [], [], [learn]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'No goal' }));
    await waitFor(() => {
      expect(toastMessages()).toContain('Removed from Learn Rust.');
    });
    expect(fake.calls.find((c) => c.method === 'PUT')?.body).toEqual({ goalId: null });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Learn Rust' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('No goal')).toBeInTheDocument();
  });

  it('sends nothing when the current choice is picked again', async () => {
    const task = makeTask({ goal: goalOf(learn) });
    const fake = createFakeApi([task], [], [], [learn]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Learn Rust' }));
    expect(fake.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('works for done and archived tasks too', async () => {
    const task = makeTask({
      status: 'done',
      completedAt: '2025-10-01T00:00:00.000Z',
      archivedAt: '2025-10-02T00:00:00.000Z',
    });
    const fake = createFakeApi([task], [], [], [learn]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Learn Rust' }));
    await waitFor(() => {
      expect(toastMessages()).toContain('Added to Learn Rust.');
    });
  });

  it('shows a search box above 8 goals and filters by it', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      makeGoal({ title: `Goal number ${String(i)}` }),
    );
    const task = makeTask();
    const { user } = await openLoaded(createFakeApi([task], [], [], many), task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    const search = await screen.findByRole('textbox', { name: 'Search goals' });
    await waitFor(() => {
      expect(search).toHaveFocus();
    });
    await user.keyboard('number 7');
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'No goal',
      'Goal number 7',
    ]);
    await user.clear(search);
    await user.keyboard('zzz');
    expect(screen.getByText('No matching goals.')).toBeInTheDocument();
  });

  it('has no search box with 8 goals', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => makeGoal({ title: `G${String(i)}` }));
    const task = makeTask();
    const { user } = await openLoaded(createFakeApi([task], [], [], eight), task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await screen.findByRole('menuitemradio', { name: 'G7' });
    expect(screen.queryByRole('textbox', { name: 'Search goals' })).not.toBeInTheDocument();
  });

  it('picks the first match with Enter in the search box', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      makeGoal({ title: `Goal number ${String(i)}` }),
    );
    const task = makeTask();
    const fake = createFakeApi([task], [], [], many);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await screen.findByRole('textbox', { name: 'Search goals' });
    await user.keyboard('number 3{Enter}');
    await waitFor(() => {
      expect(toastMessages()).toContain('Added to Goal number 3.');
    });
  });

  it('works with the keyboard: arrows, Enter, and Escape returns focus to the trigger', async () => {
    const task = makeTask();
    const fake = createFakeApi([task], [], [], [learn, fit]);
    const { user, onClose } = await openLoaded(fake, task.id);
    const trigger = screen.getByRole('button', { name: 'Change goal' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const noGoal = await screen.findByRole('menuitemradio', { name: 'No goal' });
    await waitFor(() => {
      expect(noGoal).toHaveFocus();
    });
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Learn Rust' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowUp}{Escape}');
    expect(screen.queryByRole('menu', { name: 'Goals' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    await screen.findByRole('menu', { name: 'Goals' });
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => {
      expect(toastMessages()).toContain('Added to Get fit.');
    });
    expect(trigger).toHaveFocus();
  });

  it('tells the user when there are no active goals', async () => {
    const task = makeTask();
    const { user } = await openLoaded(createFakeApi([task]), task.id);
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    const link = await screen.findByRole('menuitem', { name: 'Goals page' });
    expect(link).toHaveAttribute('href', '/tasks/goals');
    expect(link.parentElement).toHaveTextContent('No active goals. Create one on the Goals page.');
  });

  it('shows a subtask read-only and follows the parent', async () => {
    const parent = makeTask({ goal: goalOf(learn) });
    const sub = makeTask({ parentTaskId: parent.id });
    const { user } = await openLoaded(createFakeApi([parent, sub], [], [], [learn]), sub.id);
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByText('Follows the parent task')).toHaveClass('text-fg-muted');
    expect(screen.queryByRole('button', { name: 'Change goal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Learn Rust' })).not.toBeInTheDocument();
    await user.tab();
  });

  it('renders in dark and light with theme tokens only', async () => {
    const task = makeTask({ goal: goalOf(learn) });
    for (const theme of ['dark', 'light']) {
      document.documentElement.dataset.theme = theme;
      const { user, view } = await openLoaded(createFakeApi([task], [], [], [learn]), task.id);
      await user.click(screen.getByRole('button', { name: 'Change goal' }));
      await screen.findByRole('menu', { name: 'Goals' });
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/);
      view.unmount();
    }
    delete document.documentElement.dataset.theme;
  });
});
