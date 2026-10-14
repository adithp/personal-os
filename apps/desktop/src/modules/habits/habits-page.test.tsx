import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../test/fake-api';
import { makeHabit, seedHabits, type HabitSeed } from '../../test/fake-habits';
import { openMyTasks, resetEverything, restoreEverything } from '../tasks/my-tasks/test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(() => {
  seedHabits();
  restoreEverything();
});

// "Today" is Tuesday 2025-10-07 in India. Yesterday was Monday.
const TODAY = '2025-10-07';
const YESTERDAY = '2025-10-06';
const DAY_BEFORE = '2025-10-05';

const open = async (...seeds: HabitSeed[]) => {
  seedHabits(...seeds);
  return openMyTasks(createFakeApi(), '/habits');
};
const habitCalls = (fake: Awaited<ReturnType<typeof open>>['fake'], method: string) =>
  fake.calls.filter((call) => call.method === method && call.path.startsWith('/habits'));

describe('states', () => {
  it('shows the loading line, then the first-habit card when there is none', async () => {
    seedHabits();
    const fake = createFakeApi();
    fake.slow(100);
    await openMyTasks(fake, '/habits');
    expect(await screen.findByText('Loading habits…')).toBeInTheDocument();
    expect(await screen.findByText('No habits yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New habit' })).toHaveLength(2);
  });

  it('shows the server message with Try again on an error, and recovers', async () => {
    seedHabits({ habit: makeHabit({ name: 'Run' }) });
    const fake = createFakeApi();
    fake.failNext(500, 'boom', 'The habits are away.', '/habits');
    const { user } = await openMyTasks(fake, '/habits');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The habits are away.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('group', { name: 'Run' })).toBeInTheDocument();
  });
});

describe('today list', () => {
  it('lists undone habits first, then done, and hides the ones not due in Not today', async () => {
    const { user } = await open(
      { habit: makeHabit({ name: 'Done one' }), logs: { [TODAY]: 1 } },
      { habit: makeHabit({ name: 'Open one' }) },
      { habit: makeHabit({ name: 'Mondays', schedule: { type: 'weekly', days: [1] } }) },
    );
    await screen.findByRole('group', { name: 'Open one' });
    const names = [...document.querySelectorAll('[data-item-key]')].map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Open one', 'Done one']);
    expect(screen.getByText('1 of 2 done today')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Not today \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Mondays' })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(await screen.findByRole('group', { name: 'Mondays' })).toBeInTheDocument();
  });

  it('checks a habit with one click and unchecks it with another', async () => {
    const { user, fake } = await open({ habit: makeHabit({ name: 'Run' }) });
    await user.click(await screen.findByRole('checkbox', { name: 'Done: Run' }));
    expect(await screen.findByRole('checkbox', { name: 'Undo: Run' })).toBeChecked();
    expect(habitCalls(fake, 'PUT')[0]?.path).toMatch(/\/log$/);
    expect(await screen.findByText('Marked done.')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Undo: Run' }));
    expect(await screen.findByRole('checkbox', { name: 'Done: Run' })).not.toBeChecked();
    expect(habitCalls(fake, 'DELETE')).toHaveLength(1);
  });

  it('counts up a counter habit with + and down with -', async () => {
    const { user } = await open({ habit: makeHabit({ name: 'Water', target: 3 }) });
    await user.click(await screen.findByRole('button', { name: 'Add one: Water' }));
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add one: Water' }));
    await user.click(screen.getByRole('button', { name: 'Add one: Water' }));
    expect(await screen.findByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add one: Water' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove one: Water' }));
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
  });

  it('shows the streak and the at-risk badge', async () => {
    await open({
      habit: makeHabit({ name: 'Read' }),
      logs: { [YESTERDAY]: 1, [DAY_BEFORE]: 1 },
    });
    const row = await screen.findByRole('group', { name: 'Read' });
    expect(within(row).getByRole('img', { name: 'Streak: 2 days' })).toBeInTheDocument();
    expect(within(row).getByText('At risk')).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const { user } = await open(
      { habit: makeHabit({ name: 'Run', category: 'Health' }) },
      { habit: makeHabit({ name: 'Piano', category: 'Art' }) },
    );
    await screen.findByRole('group', { name: 'Run' });
    await user.click(screen.getByRole('button', { name: 'Art' }));
    expect(screen.queryByRole('group', { name: 'Run' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Piano' })).toBeInTheDocument();
  });
});

describe('create, edit, archive', () => {
  it('creates a weekly habit from the dialog', async () => {
    const { user, fake } = await open();
    await user.click(
      (await screen.findAllByRole('button', { name: 'New habit' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog', { name: 'New habit' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    await user.type(within(dialog).getByLabelText('Name'), 'Gym');
    await user.click(within(dialog).getByRole('radio', { name: 'Weekly' }));
    await user.click(within(dialog).getByRole('button', { name: 'Sat' }));
    expect(within(dialog).getByText(/Reminders are not sent yet/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create habit' }));

    expect(await screen.findByRole('group', { name: 'Gym' })).toBeInTheDocument();
    expect(habitCalls(fake, 'POST').find((c) => c.path === '/habits')?.body).toMatchObject({
      name: 'Gym',
      schedule: { type: 'weekly', days: [1, 2, 3, 4, 5, 6] },
      target: 1,
    });
  });

  it('asks for a name', async () => {
    const { user, fake } = await open();
    await user.click(
      (await screen.findAllByRole('button', { name: 'New habit' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog', { name: 'New habit' });
    await user.click(within(dialog).getByRole('button', { name: 'Create habit' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Add a name');
    expect(habitCalls(fake, 'POST')).toHaveLength(0);
  });

  it('archives from the edit dialog, lists it under Archived, and restores it', async () => {
    const { user } = await open({ habit: makeHabit({ name: 'Run' }) });
    await user.click(await screen.findByRole('group', { name: 'Run' }));
    await user.click(await screen.findByRole('button', { name: 'Edit habit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit habit' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Run' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('radio', { name: 'Archived' }));
    await user.click(await screen.findByRole('button', { name: 'Restore: Run' }));
    await user.click(screen.getByRole('radio', { name: 'Active' }));
    expect(await screen.findByRole('group', { name: 'Run' })).toBeInTheDocument();
  });

  it('says so when nothing is archived', async () => {
    const { user } = await open({ habit: makeHabit({ name: 'Run' }) });
    await screen.findByRole('group', { name: 'Run' });
    await user.click(screen.getByRole('radio', { name: 'Archived' }));
    expect(await screen.findByText('No archived habits')).toBeInTheDocument();
  });
});

describe('detail panel', () => {
  it('shows streaks, the history calendar and statistics', async () => {
    const { user } = await open({
      habit: makeHabit({ name: 'Run', notes: 'Easy pace' }),
      logs: { [YESTERDAY]: 1, [DAY_BEFORE]: 1 },
    });
    await user.click(await screen.findByRole('group', { name: 'Run' }));
    const panel = await screen.findByRole('complementary', { name: 'Habit details' });
    expect(within(panel).getByRole('group', { name: 'Current streak' })).toHaveTextContent(
      '2 days',
    );
    expect(within(panel).getByText('Easy pace')).toBeInTheDocument();

    expect(await within(panel).findByRole('button', { name: /Mon, 6 Oct, done/ })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: /Wed, 8 Oct, later/ })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Next month' })).toBeDisabled();
    await user.click(within(panel).getByRole('button', { name: 'Previous month' }));
    expect(await within(panel).findByText('September 2025')).toBeInTheDocument();

    await user.click(within(panel).getByRole('radio', { name: 'Month' }));
    expect(await within(panel).findByRole('group', { name: 'Total done' })).toHaveTextContent('2');
  });

  it('toggles a past day from the calendar', async () => {
    const { user, fake } = await open({ habit: makeHabit({ name: 'Run' }) });
    await user.click(await screen.findByRole('group', { name: 'Run' }));
    const panel = await screen.findByRole('complementary', { name: 'Habit details' });
    await user.click(await within(panel).findByRole('button', { name: /Mon, 6 Oct, missed/ }));
    expect(
      await within(panel).findByRole('button', { name: /Mon, 6 Oct, done/ }),
    ).toBeInTheDocument();
    expect(habitCalls(fake, 'PUT').find((call) => call.path.endsWith('/log'))?.body).toEqual({
      date: YESTERDAY,
    });

    await user.click(within(panel).getByRole('button', { name: /Mon, 6 Oct, done/ }));
    expect(
      await within(panel).findByRole('button', { name: /Mon, 6 Oct, missed/ }),
    ).toBeInTheDocument();
  });

  it('shows an error for the history with Try again', async () => {
    seedHabits({ habit: makeHabit({ name: 'Run' }) });
    const fake = createFakeApi();
    const { user } = await openMyTasks(fake, '/habits');
    await user.click(await screen.findByRole('group', { name: 'Run' }));
    await screen.findByRole('complementary', { name: 'Habit details' });
    fake.failNext(500, 'boom', 'No history today.', '/habits/');
    await user.click(screen.getByRole('radio', { name: 'Month' }));
    expect(await screen.findByText('No history today.')).toBeInTheDocument();
  });
});

describe('keyboard', () => {
  it('moves with the arrows, checks with Space, opens with Enter, closes with Escape', async () => {
    const { user } = await open(
      { habit: makeHabit({ name: 'A habit' }) },
      { habit: makeHabit({ name: 'B habit' }) },
    );
    const first = await screen.findByRole('group', { name: 'A habit' });
    first.focus();
    await user.keyboard('{ArrowDown}');
    const second = screen.getByRole('group', { name: 'B habit' });
    expect(second).toHaveFocus();

    await user.keyboard(' ');
    expect(await screen.findByRole('checkbox', { name: 'Undo: B habit' })).toBeChecked();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('complementary', { name: 'Habit details' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(
        screen.queryByRole('complementary', { name: 'Habit details' }),
      ).not.toBeInTheDocument();
    });
  });

  it('opens New habit with N, Edit with E and the help with ?', async () => {
    const { user } = await open({ habit: makeHabit({ name: 'Run' }) });
    const row = await screen.findByRole('group', { name: 'Run' });
    row.focus();
    await user.keyboard('e');
    expect(await screen.findByRole('dialog', { name: 'Edit habit' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'New habit' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    document.body.focus();
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});
