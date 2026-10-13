import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGoal, makeTask } from '../../../../test/fake-api';
import { useTasksUi } from '../../tasks-ui-store';
import {
  findToast,
  itemOf,
  items,
  resetEverything,
  restoreEverything,
  titles,
} from '../../my-tasks/test-utils';
import { callsTo, done, goalWith, inGoal, openGoal, todo } from './goal-test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../../detail/task-detail-panel', () => ({
  TaskDetailPanel: ({ taskId }: { taskId: string }) => <aside data-testid="detail">{taskId}</aside>,
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const addBox = () => screen.getByRole('textbox', { name: 'Add a task to this goal' });
const popover = () => screen.getByRole('dialog', { name: 'Add tasks to this goal' });
const option = (name: string | RegExp) => within(popover()).getByRole('option', { name });
const openPopover = async (user: Awaited<ReturnType<typeof openGoal>>['user']) => {
  await user.click(screen.getByRole('button', { name: 'Add tasks' }));
  await within(popover()).findByRole('textbox', { name: 'Search open tasks' });
};

describe('the tasks card', () => {
  it('shows the inline input, Add tasks, and the open tasks of the goal only', async () => {
    const other = makeGoal({ title: 'Other' });
    await openGoal(
      goalWith(
        {},
        (goal) => [
          todo('Read the book', goal, { position: 1 }),
          todo('Write a crate', goal, { position: 2 }),
        ],
        [makeTask({ title: 'Unrelated' }), makeTask({ title: 'Elsewhere', goal: inGoal(other) })],
        [other],
      ),
    );
    await screen.findByRole('checkbox', { name: 'Complete: Read the book' });
    expect(titles()).toEqual(['Read the book', 'Write a crate']);
    expect(addBox()).toHaveAttribute('placeholder', 'Add a task to this goal…');
    expect(screen.getByRole('button', { name: 'Add tasks' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tasks' })).toBeInTheDocument();
  });

  it('asks the server for the goal tasks of every status', async () => {
    const setup = goalWith({}, (goal) => [todo('a', goal)]);
    const { fake } = await openGoal(setup);
    await screen.findByRole('checkbox', { name: 'Complete: a' });
    const call = callsTo(fake, 'GET', '/tasks').find((c) => c.query?.goalId !== undefined);
    expect(call?.query).toEqual({ goalId: setup.goal.id });
  });

  it('groups open, done and archived tasks, with done and archived collapsed', async () => {
    const { user } = await openGoal(
      goalWith({}, (goal) => [
        todo('Open one', goal, { position: 1 }),
        done('Finished one', goal, { position: 2 }),
        done('Finished two', goal, { position: 3 }),
        done('Finished three', goal, { position: 4 }),
        todo('Parked', goal, { position: 5, archivedAt: '2025-10-05T00:00:00.000Z' }),
      ]),
    );
    await screen.findByRole('checkbox', { name: 'Complete: Open one' });
    expect(titles()).toEqual(['Open one']);
    const doneToggle = screen.getByRole('button', { name: 'Done (3)' });
    const archivedToggle = screen.getByRole('button', { name: 'Archived (1)' });
    expect(doneToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(doneToggle);
    expect(doneToggle).toHaveAttribute('aria-expanded', 'true');
    expect(titles()).toEqual(['Open one', 'Finished one', 'Finished two', 'Finished three']);
    await user.click(archivedToggle);
    expect(titles().at(-1)).toBe('Parked');
    await user.click(doneToggle);
    expect(titles()).toEqual(['Open one', 'Parked']);
  });

  it('shows no group buttons when there are no done or archived tasks', async () => {
    await openGoal(goalWith({}, (goal) => [todo('a', goal)]));
    await screen.findByRole('checkbox', { name: 'Complete: a' });
    expect(screen.queryByRole('button', { name: /^Done/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Archived/ })).toBeNull();
  });

  it('completes a task with its checkbox and moves it to Done', async () => {
    const { user, fake } = await openGoal(
      goalWith({}, (goal) => [todo('a', goal), todo('b', goal)]),
    );
    await user.click(await screen.findByRole('checkbox', { name: 'Complete: a' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', `/tasks/${fake.tasks()[0]?.id ?? ''}/complete`)).toHaveLength(1);
    });
    expect(await screen.findByRole('button', { name: 'Done (1)' })).toBeInTheDocument();
    expect(titles()).toEqual(['b']);
  });
});

describe('creating a task in the goal', () => {
  it('creates a plain-title task linked to the goal on Enter and keeps focus', async () => {
    const setup = goalWith();
    const { user, fake } = await openGoal(setup);
    await user.type(addBox(), 'Buy tomorrow at 5pm #tag{Enter}');
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/tasks')[0]?.body).toEqual({
        title: 'Buy tomorrow at 5pm #tag',
        goalId: setup.goal.id,
      });
    });
    expect(addBox()).toHaveValue('');
    expect(addBox()).toHaveFocus();
    expect(
      await screen.findByRole('checkbox', { name: /Complete: Buy tomorrow/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Progress' })).toHaveTextContent('0 of 1');
  });

  it('ignores an empty or blank title', async () => {
    const { user, fake } = await openGoal(goalWith());
    await user.type(addBox(), '   {Enter}');
    expect(callsTo(fake, 'POST', '/tasks')).toHaveLength(0);
  });
});

describe('the Add tasks popover', () => {
  const tasksSetup = () => {
    const other = makeGoal({ title: 'Cook more' });
    return goalWith(
      {},
      (goal) => [todo('Linked task', goal, { position: 1 })],
      [
        makeTask({ title: 'Free task', position: 2 }),
        makeTask({ title: 'Taken task', position: 3, goal: inGoal(other) }),
        makeTask({ title: 'Finished elsewhere', position: 4, status: 'done' }),
        makeTask({
          title: 'Archived elsewhere',
          position: 5,
          archivedAt: '2025-10-01T00:00:00.000Z',
        }),
      ],
      [other],
    );
  };

  it('lists open tasks with a check on linked ones and the other goal in muted text', async () => {
    const { user } = await openGoal(tasksSetup());
    await openPopover(user);
    await waitFor(() => {
      expect(option('Free task')).toBeInTheDocument();
    });
    expect(option('Linked task')).toHaveAttribute('aria-selected', 'true');
    expect(option('Free task')).toHaveAttribute('aria-selected', 'false');
    expect(option(/Taken task/)).toHaveTextContent('In: Cook more');
    expect(within(popover()).queryByRole('option', { name: /Finished elsewhere/ })).toBeNull();
    expect(within(popover()).queryByRole('option', { name: /Archived elsewhere/ })).toBeNull();
    expect(popover()).toHaveClass('glass-strong');
  });

  it('focuses the search box and filters by title', async () => {
    const { user } = await openGoal(tasksSetup());
    await openPopover(user);
    const search = within(popover()).getByRole('textbox', { name: 'Search open tasks' });
    expect(search).toHaveFocus();
    await user.type(search, 'free');
    expect(within(popover()).getAllByRole('option')).toHaveLength(1);
    expect(option('Free task')).toBeInTheDocument();
  });

  it('says "No matching tasks." when the search finds nothing', async () => {
    const { user } = await openGoal(tasksSetup());
    await openPopover(user);
    await user.type(within(popover()).getByRole('textbox'), 'zzz');
    expect(within(popover()).getByText('No matching tasks.')).toBeInTheDocument();
  });

  it('says "No open tasks. Type above to add one to this goal." when there are none', async () => {
    const { user } = await openGoal(goalWith());
    await openPopover(user);
    expect(
      await within(popover()).findByText('No open tasks. Type above to add one to this goal.'),
    ).toBeInTheDocument();
  });

  it('adds a free task with "Added to Learn Rust." and stays open', async () => {
    const setup = tasksSetup();
    const { user, fake } = await openGoal(setup);
    await openPopover(user);
    const free = fake.tasks().find((task) => task.title === 'Free task');
    await user.click(await within(popover()).findByRole('option', { name: 'Free task' }));
    await waitFor(() => {
      expect(callsTo(fake, 'PUT', `/tasks/${free?.id ?? ''}/goal`)[0]?.body).toEqual({
        goalId: setup.goal.id,
      });
    });
    await findToast('Added to Learn Rust.');
    expect(popover()).toBeInTheDocument();
    await waitFor(() => {
      expect(option('Free task')).toHaveAttribute('aria-selected', 'true');
    });
    // It shows in the list behind the popover too
    expect(
      await screen.findByRole('checkbox', { name: 'Complete: Free task' }),
    ).toBeInTheDocument();
  });

  it('moves a task from another goal with "Moved to Learn Rust."', async () => {
    const { user } = await openGoal(tasksSetup());
    await openPopover(user);
    await user.click(await within(popover()).findByRole('option', { name: /Taken task/ }));
    await findToast('Moved to Learn Rust.');
    await waitFor(() => {
      expect(option('Taken task')).toHaveAttribute('aria-selected', 'true');
    });
    expect(option('Taken task')).not.toHaveTextContent('In:');
  });

  it('unlinks a linked task with "Removed from Learn Rust." when clicked again', async () => {
    const setup = tasksSetup();
    const { user, fake } = await openGoal(setup);
    await openPopover(user);
    const linked = fake.tasks().find((task) => task.title === 'Linked task');
    await user.click(await within(popover()).findByRole('option', { name: 'Linked task' }));
    await waitFor(() => {
      expect(callsTo(fake, 'PUT', `/tasks/${linked?.id ?? ''}/goal`)[0]?.body).toEqual({
        goalId: null,
      });
    });
    await findToast('Removed from Learn Rust.');
    await waitFor(() => {
      expect(option('Linked task')).toHaveAttribute('aria-selected', 'false');
    });
    expect(popover()).toBeInTheDocument();
  });

  it('Undo on the toast puts a link back', async () => {
    const { user, fake } = await openGoal(tasksSetup());
    await openPopover(user);
    await user.click(await within(popover()).findByRole('option', { name: 'Free task' }));
    await findToast('Added to Learn Rust.');
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/undo')).toHaveLength(1);
    });
    // The click on the toast is outside the popover, so it closed; open it again to look
    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: 'Complete: Free task' })).toBeNull();
    });
    await openPopover(user);
    expect(await within(popover()).findByRole('option', { name: 'Free task' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('links with the keyboard: Enter in the box links the first match, Arrow Down then Enter links one', async () => {
    const setup = tasksSetup();
    const { user, fake } = await openGoal(setup);
    await openPopover(user);
    await user.type(within(popover()).getByRole('textbox'), 'free{Enter}');
    await findToast('Added to Learn Rust.');
    await user.clear(within(popover()).getByRole('textbox'));
    await user.keyboard('{ArrowDown}');
    expect(within(popover()).getAllByRole('option')[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}');
    expect(within(popover()).getByRole('textbox')).toHaveFocus();
    expect(
      callsTo(
        fake,
        'PUT',
        `/tasks/${fake.tasks().find((t) => t.title === 'Free task')?.id ?? ''}/goal`,
      ),
    ).toHaveLength(1);
  });

  it('closes with Escape (focus back on the button) without leaving the page', async () => {
    const setup = tasksSetup();
    const { user, router } = await openGoal(setup);
    await openPopover(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Add tasks to this goal' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add tasks' })).toHaveFocus();
    expect(router.state.location.pathname).toBe(`/tasks/goals/${setup.goal.id}`);
  });

  it('closes on a click outside', async () => {
    const { user } = await openGoal(tasksSetup());
    await openPopover(user);
    await user.click(screen.getByRole('heading', { name: 'Tasks' }));
    expect(screen.queryByRole('dialog', { name: 'Add tasks to this goal' })).toBeNull();
  });

  it('opens again with the search box cleared', async () => {
    const { user } = await openGoal(tasksSetup());
    await openPopover(user);
    await user.type(within(popover()).getByRole('textbox'), 'free');
    await user.keyboard('{Escape}');
    await openPopover(user);
    expect(within(popover()).getByRole('textbox')).toHaveValue('');
  });
});

describe('removing a task from the goal', () => {
  it('unlinks with the row button, shows Undo and never deletes the task', async () => {
    const setup = goalWith({}, (goal) => [todo('a', goal), todo('b', goal)]);
    const { user, fake } = await openGoal(setup);
    const a = fake.tasks().find((task) => task.title === 'a');
    await user.click(await screen.findByRole('button', { name: 'Remove from goal: a' }));
    await waitFor(() => {
      expect(callsTo(fake, 'PUT', `/tasks/${a?.id ?? ''}/goal`)[0]?.body).toEqual({ goalId: null });
    });
    await findToast('Removed from Learn Rust.');
    await waitFor(() => {
      expect(titles()).toEqual(['b']);
    });
    expect(fake.tasks().map((task) => task.title)).toContain('a');
    expect(callsTo(fake, 'DELETE', `/tasks/${a?.id ?? ''}`)).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(titles()).toEqual(['a', 'b']);
    });
  });

  it('has no trash button on the rows', async () => {
    await openGoal(goalWith({}, (goal) => [todo('a', goal)]));
    await screen.findByRole('checkbox', { name: 'Complete: a' });
    expect(screen.queryByRole('button', { name: /^Delete:/ })).toBeNull();
  });

  it('removing does not open the task', async () => {
    const { user } = await openGoal(goalWith({}, (goal) => [todo('a', goal)]));
    await user.click(await screen.findByRole('button', { name: 'Remove from goal: a' }));
    expect(screen.queryByTestId('detail')).toBeNull();
  });
});

describe('opening a task', () => {
  it('opens the detail panel when a row is clicked', async () => {
    const { user, fake } = await openGoal(goalWith({}, (goal) => [todo('a', goal)]));
    await screen.findByRole('checkbox', { name: 'Complete: a' });
    await user.click(itemOf('a'));
    expect(await screen.findByTestId('detail')).toHaveTextContent(fake.tasks()[0]?.id ?? '');
  });

  it('shows the panel for the task that was open on another page only after you pick one', async () => {
    useTasksUi.getState().select('some-other-task');
    await openGoal(goalWith({}, (goal) => [todo('a', goal)]));
    await screen.findByRole('checkbox', { name: 'Complete: a' });
    expect(screen.queryByTestId('detail')).toBeNull();
    expect(items()).toHaveLength(1);
  });
});
