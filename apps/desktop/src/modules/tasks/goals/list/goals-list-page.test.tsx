import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../../store/settings-store';
import { createFakeApi, makeGoal, makeTask } from '../../../../test/fake-api';
import { openMyTasks, resetEverything, restoreEverything } from '../../my-tasks/test-utils';
import { useGoalPrompts } from '../prompt-store';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

// "Now" is 3 PM on Tuesday 7 October 2025 in India
const DEC_31 = '2025-12-30T18:30:00.000Z';
const SEPT_2 = '2025-09-01T18:30:00.000Z';

const goalsOf = (...goals: ReturnType<typeof makeGoal>[]) => createFakeApi([], [], [], goals);
const open = (fake = goalsOf()) => openMyTasks(fake, '/tasks/goals');
const cardOf = (title: string) =>
  screen.getByRole('link', { name: title }).closest('li') as HTMLElement;
const firstNewGoal = () => {
  const [first] = screen.getAllByRole('button', { name: 'New goal' });
  if (!first) throw new Error('No New goal button');
  return first;
};
const cards = () => screen.queryAllByRole('link').filter((el) => el.hasAttribute('data-item-key'));

/** A goal with `done` of `total` tasks, as the mock API counts them. */
function goalWithTasks(title: string, done: number, total: number, extra = {}) {
  const goal = makeGoal({ title, ...extra });
  const tasks = Array.from({ length: total }, (_, index) =>
    makeTask({
      title: `${title} ${String(index)}`,
      status: index < done ? 'done' : 'todo',
      goal: { id: goal.id, title },
    }),
  );
  return { goal, tasks };
}

describe('states', () => {
  it('shows the loading line while the goals load', async () => {
    const fake = goalsOf(makeGoal({ title: 'Learn Rust' }));
    fake.slow(200);
    await open(fake);
    expect(await screen.findByText('Loading goals…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Learn Rust' })).toBeInTheDocument();
  });

  it('shows the first-goal card when there never was a goal', async () => {
    await open();
    expect(await screen.findByText('No goals yet')).toBeInTheDocument();
    expect(
      screen.getByText('A goal groups the tasks that move you toward something bigger.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New goal' })).toHaveLength(2);
  });

  it('shows the empty line of the Achieved and Dropped tabs', async () => {
    const { user } = await open(goalsOf(makeGoal({ title: 'Learn Rust' })));
    await screen.findByRole('link', { name: 'Learn Rust' });
    await user.click(screen.getByRole('radio', { name: 'Achieved' }));
    expect(await screen.findByText('No achieved goals yet')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Dropped' }));
    expect(await screen.findByText('No dropped goals')).toBeInTheDocument();
    expect(screen.queryByText('No goals yet')).not.toBeInTheDocument();
  });

  it('shows the server message with Try again on an error, and recovers', async () => {
    const fake = goalsOf(makeGoal({ title: 'Learn Rust' }));
    fake.failNext(500, 'boom', 'The goals are away.', '/goals');
    const { user } = await open(fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The goals are away.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Learn Rust' })).toBeInTheDocument();
  });
});

describe('header and tabs', () => {
  it('shows the title, the active count, and Active as the default tab', async () => {
    await open(
      goalsOf(
        makeGoal({ title: 'A' }),
        makeGoal({ title: 'B' }),
        makeGoal({ title: 'C', status: 'achieved', closedAt: '2025-10-12T18:40:00.000Z' }),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Goals' })).toBeInTheDocument();
    expect(await screen.findByText('2 active')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Active' })).toBeChecked();
    expect(screen.queryByRole('link', { name: 'C' })).not.toBeInTheDocument();
  });

  it('switches the list with the tabs without asking the API again', async () => {
    const fake = goalsOf(
      makeGoal({ title: 'A' }),
      makeGoal({ title: 'Done one', status: 'achieved', closedAt: '2025-10-12T18:40:00.000Z' }),
      makeGoal({ title: 'Gone one', status: 'dropped', closedAt: '2025-10-12T18:40:00.000Z' }),
    );
    const { user } = await open(fake);
    await screen.findByRole('link', { name: 'A' });
    await user.click(screen.getByRole('radio', { name: 'Achieved' }));
    expect(await screen.findByRole('link', { name: 'Done one' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'A' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Dropped' }));
    expect(await screen.findByRole('link', { name: 'Gone one' })).toBeInTheDocument();
    expect(fake.calls.filter((c) => c.method === 'GET' && c.path === '/goals')).toHaveLength(1);
  });
});

describe('cards', () => {
  it('shows progress, percent, the bar, and the target', async () => {
    const { goal, tasks } = goalWithTasks('Pass exams', 3, 8, { targetAt: DEC_31 });
    await open(createFakeApi(tasks, [], [], [goal]));
    const card = within(
      await screen.findByRole('link', { name: 'Pass exams' }).then(cardOf.bind(null, 'Pass exams')),
    );
    expect(card.getByText('3 of 8 tasks')).toBeInTheDocument();
    expect(card.getByText('38%')).toBeInTheDocument();
    expect(card.getByRole('progressbar', { name: 'Tasks done: 3 of 8' })).toHaveAttribute(
      'aria-valuenow',
      '38',
    );
    expect(card.getByText('By 31 Dec')).toBeInTheDocument();
    expect(card.queryByText('Mark as achieved')).not.toBeInTheDocument();
  });

  it('shows "No tasks yet" with no bar, and no target date', async () => {
    await open(goalsOf(makeGoal({ title: 'Learn Rust' })));
    const card = within(
      await screen.findByRole('link', { name: 'Learn Rust' }).then(() => cardOf('Learn Rust')),
    );
    expect(card.getByText('No tasks yet')).toBeInTheDocument();
    expect(card.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(card.getByText('No target date')).toBeInTheDocument();
  });

  it('adds the year to a target in another year', async () => {
    await open(goalsOf(makeGoal({ title: 'Far', targetAt: '2026-12-30T18:30:00.000Z' })));
    expect(await screen.findByText('By 31 Dec 2026')).toBeInTheDocument();
  });

  it('shows "Target passed" in the danger color for an active goal', async () => {
    await open(goalsOf(makeGoal({ title: 'Late', targetAt: SEPT_2 })));
    const text = await screen.findByText('Target passed · 2 Sept');
    expect(text).toHaveClass('text-danger');
  });

  it('shows Achieved and Dropped cards with the day they were closed', async () => {
    const closedAt = '2025-10-12T18:40:00.000Z'; // 13 Oct in India
    const { user } = await open(
      goalsOf(
        makeGoal({ title: 'Won', status: 'achieved', closedAt, targetAt: SEPT_2 }),
        makeGoal({ title: 'Lost', status: 'dropped', closedAt }),
      ),
    );
    await user.click(screen.getByRole('radio', { name: 'Achieved' }));
    expect(await screen.findByText('Achieved 13 Oct')).toBeInTheDocument();
    expect(screen.queryByText(/Target passed/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Dropped' }));
    expect(await screen.findByText('Dropped 13 Oct')).toBeInTheDocument();
  });

  it('links the whole card to the goal page', async () => {
    const goal = makeGoal({ title: 'Learn Rust' });
    await open(goalsOf(goal));
    const link = await screen.findByRole('link', { name: 'Learn Rust' });
    expect(link).toHaveAttribute('href', `/tasks/goals/${goal.id}`);
    expect(link.querySelector('button')).toBeNull();
  });
});

describe('Mark as achieved', () => {
  it('shows when every task is done and marks the goal achieved', async () => {
    const { goal, tasks } = goalWithTasks('Ship it', 2, 2);
    const fake = createFakeApi(tasks, [], [], [goal]);
    const { user } = await open(fake);
    const card = within(
      await screen.findByRole('link', { name: 'Ship it' }).then(() => cardOf('Ship it')),
    );
    expect(card.getByText('All tasks done')).toBeInTheDocument();
    // The button is not inside the link
    const button = card.getByRole('button', { name: 'Mark as achieved: Ship it' });
    expect(button.closest('a')).toBeNull();
    await user.click(button);
    expect(
      fake.calls.find((c) => c.method === 'POST' && c.path === `/goals/${goal.id}/status`)?.body,
    ).toEqual({
      status: 'achieved',
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Ship it' })).not.toBeInTheDocument();
    });
  });

  it('is hidden when the goal has open tasks, no tasks, or was dismissed for this total', async () => {
    const open1 = goalWithTasks('Open', 1, 2);
    const none = makeGoal({ title: 'Empty' });
    const dismissed = goalWithTasks('Later', 2, 2);
    useGoalPrompts.getState().dismiss(dismissed.goal.id, 2);
    await open(
      createFakeApi(
        [...open1.tasks, ...dismissed.tasks],
        [],
        [],
        [open1.goal, none, dismissed.goal],
      ),
    );
    await screen.findByRole('link', { name: 'Later' });
    expect(screen.queryByRole('button', { name: /^Mark as achieved/ })).not.toBeInTheDocument();
  });

  it('shows again when the number of tasks changed after "Not yet"', async () => {
    const { goal, tasks } = goalWithTasks('Grown', 3, 3);
    useGoalPrompts.getState().dismiss(goal.id, 2);
    await open(createFakeApi(tasks, [], [], [goal]));
    expect(
      await screen.findByRole('button', { name: 'Mark as achieved: Grown' }),
    ).toBeInTheDocument();
  });
});

describe('New goal dialog', () => {
  it('opens with focus in the title, closes with Escape and gives focus back', async () => {
    const { user } = await open(goalsOf(makeGoal({ title: 'A' })));
    await screen.findByRole('link', { name: 'A' });
    const button = screen.getByRole('button', { name: 'New goal' });
    await user.click(button);
    const dialog = screen.getByRole('dialog', { name: 'New goal' });
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const { user } = await open();
    await screen.findByText('No goals yet');
    await user.click(firstNewGoal());
    const dialog = screen.getByRole('dialog', { name: 'New goal' });
    const create = within(dialog).getByRole('button', { name: 'Create goal' });
    create.focus();
    await user.tab();
    expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(create).toHaveFocus();
  });

  it('refuses an empty title', async () => {
    const fake = goalsOf();
    const { user } = await open(fake);
    await screen.findByText('No goals yet');
    await user.click(firstNewGoal());
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a title');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
    expect(fake.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('creates with Enter in the title and opens the new goal page', async () => {
    const fake = goalsOf();
    const { user, router } = await open(fake);
    await screen.findByText('No goals yet');
    await user.click(firstNewGoal());
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Learn Rust{Enter}');
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/tasks\/goals\/[0-9a-f-]{36}$/);
    });
    const post = fake.calls.find((c) => c.method === 'POST' && c.path === '/goals');
    expect(post?.body).toEqual({ title: 'Learn Rust' });
    const { items } = await fake.api.request<{ items: { id: string }[] }>('GET', '/goals');
    expect(router.state.location.pathname).toBe(`/tasks/goals/${items[0]?.id ?? ''}`);
  });

  it('sends the target date typed in the date box (start of the India day)', async () => {
    const fake = goalsOf();
    const { user } = await open(fake);
    await screen.findByText('No goals yet');
    await user.click(firstNewGoal());
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Run');
    const date = screen.getByLabelText('Target date');
    fireEvent.change(date, { target: { value: '2025-12-31' } });
    fireEvent.blur(date);
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    await waitFor(() => {
      expect(fake.calls.find((c) => c.method === 'POST' && c.path === '/goals')?.body).toEqual({
        title: 'Run',
        targetAt: DEC_31,
      });
    });
  });

  it('keeps the dialog open and shows the server message when creating fails', async () => {
    const fake = goalsOf();
    const { user, router } = await open(fake);
    await screen.findByText('No goals yet');
    await user.click(firstNewGoal());
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Run');
    fake.failNext(500, 'boom', 'Cannot save right now.', '/goals');
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    expect(await screen.findByText('Cannot save right now.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New goal' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tasks/goals');
  });

  it('limits the title length', async () => {
    const { user } = await open();
    await screen.findByText('No goals yet');
    await user.click(firstNewGoal());
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('maxlength', '200');
  });
});

describe('keys', () => {
  const three = () =>
    goalsOf(makeGoal({ title: 'One' }), makeGoal({ title: 'Two' }), makeGoal({ title: 'Three' }));

  /** Pretend the cards sit in a grid of 3 columns, because jsdom has no layout. */
  function layOutAsGrid(columns: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = cards().indexOf(this);
      const i = Math.max(index, 0);
      return new DOMRect((i % columns) * 200, Math.floor(i / columns) * 100, 180, 80);
    });
  }

  it('N opens the New goal dialog without typing the letter', async () => {
    const { user } = await open(three());
    await screen.findByRole('link', { name: 'One' });
    await user.keyboard('n');
    expect(screen.getByRole('dialog', { name: 'New goal' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  });

  it('does not open the dialog while typing, with Ctrl, or while a dialog is open', async () => {
    const { user } = await open(three());
    await screen.findByRole('link', { name: 'One' });
    await user.keyboard('{Control>}n{/Control}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.keyboard('n');
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'nn');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('nn');
  });

  it('moves between cards with the arrow keys by the visible grid', async () => {
    layOutAsGrid(2);
    const { user } = await open(
      goalsOf(
        makeGoal({ title: 'One' }),
        makeGoal({ title: 'Two' }),
        makeGoal({ title: 'Three' }),
        makeGoal({ title: 'Four' }),
      ),
    );
    const one = await screen.findByRole('link', { name: 'One' });
    act(() => {
      one.focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('link', { name: 'Two' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Four' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('link', { name: 'Three' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('link', { name: 'One' })).toHaveFocus();
  });

  it('makes one card the Tab stop and follows focus', async () => {
    await open(three());
    await screen.findByRole('link', { name: 'One' });
    const stops = () => cards().filter((el) => el.tabIndex === 0);
    expect(stops()).toEqual([screen.getByRole('link', { name: 'One' })]);
    act(() => {
      screen.getByRole('link', { name: 'Two' }).focus();
    });
    expect(stops()).toEqual([screen.getByRole('link', { name: 'Two' })]);
  });

  it('Enter on a card opens the goal page', async () => {
    const goals = three();
    const { user, router } = await open(goals);
    const two = await screen.findByRole('link', { name: 'Two' });
    act(() => {
      two.focus();
    });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(two.getAttribute('href'));
    });
  });

  it('? opens the help, which traps Tab, closes with Escape, and returns focus', async () => {
    const { user } = await open(three());
    const one = await screen.findByRole('link', { name: 'One' });
    act(() => {
      one.focus();
    });
    await user.keyboard('?');
    const help = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(help).getByText('New goal')).toBeInTheDocument();
    expect(within(help).getByText('Move between goals')).toBeInTheDocument();
    await user.tab();
    await user.tab();
    expect(help.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(one).toHaveFocus();
  });
});

describe('themes', () => {
  it.each(['dark', 'light'] as const)(
    'renders in %s mode with no hard-coded colors',
    async (theme) => {
      useSettings.getState().update({ theme });
      const { goal, tasks } = goalWithTasks('Ship it', 2, 2, { targetAt: SEPT_2 });
      await open(createFakeApi(tasks, [], [], [goal, makeGoal({ title: 'Empty' })]));
      await screen.findByRole('link', { name: 'Ship it' });
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
      expect(screen.getByRole('radiogroup', { name: 'Goal status' })).toBeInTheDocument();
    },
  );
});

describe('review fixes', () => {
  it('asks the server for the goals once and filters the tabs on the client', async () => {
    const fake = goalsOf(makeGoal({ title: 'Learn Rust' }));
    await open(fake);
    await screen.findByRole('link', { name: 'Learn Rust' });
    const requests = fake.calls.filter((c) => c.method === 'GET' && c.path === '/goals');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.query?.status).toBeUndefined();
  });

  it('does not flash the empty line before the goals arrive', async () => {
    const fake = goalsOf(makeGoal({ title: 'Learn Rust' }));
    fake.slow(100);
    await open(fake);
    expect(screen.queryByText('No active goals')).not.toBeInTheDocument();
    expect(screen.queryByText('No goals yet')).not.toBeInTheDocument();
    await screen.findByRole('link', { name: 'Learn Rust' });
  });

  it('gives the card link a title and names the Mark as achieved button after the goal', async () => {
    const { goal, tasks } = goalWithTasks('Ship it', 1, 1);
    await open(createFakeApi(tasks, [], [], [goal]));
    expect(await screen.findByRole('link', { name: 'Ship it' })).toHaveAttribute(
      'title',
      'Ship it',
    );
    expect(screen.getByRole('button', { name: 'Mark as achieved: Ship it' })).toBeInTheDocument();
  });

  it('closes the New goal dialog on a backdrop click only while the title box is empty', async () => {
    const { user } = await open();
    await user.click(firstNewGoal());
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'New goal' }).parentElement as Element);
    expect(screen.queryByRole('dialog', { name: 'New goal' })).not.toBeInTheDocument();
    await user.click(firstNewGoal());
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Learn');
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'New goal' }).parentElement as Element);
    expect(screen.getByRole('dialog', { name: 'New goal' })).toBeInTheDocument();
  });
});
