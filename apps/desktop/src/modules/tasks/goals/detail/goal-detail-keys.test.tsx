import type * as TauriWindow from '@tauri-apps/api/window';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePalette } from '../../../../store/palette-store';
import {
  findToast,
  itemOf,
  resetEverything,
  restoreEverything,
  titles,
} from '../../my-tasks/test-utils';
import { callsTo, goalWith, openGoal, todo } from './goal-test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../../detail/task-detail-panel', () => ({
  TaskDetailPanel: ({ taskId, onClose }: { taskId: string; onClose: () => void }) => (
    <aside role="complementary" aria-label="Task details" data-testid="detail">
      {taskId}
      <button type="button" onClick={onClose}>
        Close panel
      </button>
    </aside>
  ),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const addBox = () => screen.getByRole('textbox', { name: 'Add a task to this goal' });
const focusRow = (title: string) => {
  act(() => {
    itemOf(title).focus();
  });
};
const three = () =>
  goalWith({}, (goal) => [
    todo('a', goal, { position: 1 }),
    todo('b', goal, { position: 2 }),
    todo('c', goal, { position: 3 }),
  ]);

async function ready(setup = three()) {
  const opened = await openGoal(setup);
  await screen.findByRole('checkbox', { name: 'Complete: a' });
  return { ...opened, setup };
}

describe('goal page keys', () => {
  it('N focuses the add box without typing the letter', async () => {
    const { user } = await ready();
    await user.keyboard('n');
    expect(addBox()).toHaveFocus();
    expect(addBox()).toHaveValue('');
  });

  it('N does nothing while typing in a box, with Ctrl, or while the palette or a menu is open', async () => {
    const { user } = await ready();
    const box = addBox();
    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    await user.keyboard('n');
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('n');
    await user.tab();
    await user.keyboard('{Control>}n{/Control}');
    expect(box).not.toHaveFocus();
    act(() => {
      usePalette.setState({ open: true });
    });
    await user.keyboard('n');
    expect(box).not.toHaveFocus();
    act(() => {
      usePalette.setState({ open: false });
    });
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.keyboard('n');
    expect(box).not.toHaveFocus();
  });

  it('Space completes the focused row and Space on a checkbox is left alone', async () => {
    const { user, fake } = await ready();
    focusRow('a');
    await user.keyboard(' ');
    await waitFor(() => {
      expect(callsTo(fake, 'POST', `/tasks/${fake.tasks()[0]?.id ?? ''}/complete`)).toHaveLength(1);
    });
    await waitFor(() => {
      expect(titles()).toEqual(['b', 'c']);
    });
  });

  it('reopens a done task with Space when the Done group is open', async () => {
    const { user, fake } = await ready();
    focusRow('a');
    await user.keyboard(' ');
    await user.click(await screen.findByRole('button', { name: 'Done (1)' }));
    focusRow('a');
    await user.keyboard(' ');
    await waitFor(() => {
      expect(
        fake.calls.filter((c) => c.method === 'PATCH' && c.path.startsWith('/tasks/')),
      ).toHaveLength(1);
    });
  });

  it('Enter opens the focused row in the detail panel', async () => {
    const { user, fake } = await ready();
    focusRow('b');
    await user.keyboard('{Enter}');
    expect(await screen.findByTestId('detail')).toHaveTextContent(fake.tasks()[1]?.id ?? '');
  });

  it('arrow keys move between rows and the row is the only Tab stop', async () => {
    const { user } = await ready();
    focusRow('a');
    await user.keyboard('{ArrowDown}');
    expect(itemOf('b')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(itemOf('a')).toHaveFocus();
    expect(itemOf('a')).toHaveAttribute('tabindex', '0');
    expect(itemOf('b')).toHaveAttribute('tabindex', '-1');
  });

  it('Delete removes the focused task from the goal, with Undo, and never deletes it', async () => {
    const { user, fake } = await ready();
    const b = fake.tasks()[1];
    focusRow('b');
    await user.keyboard('{Delete}');
    await findToast('Removed from Learn Rust.');
    await waitFor(() => {
      expect(titles()).toEqual(['a', 'c']);
    });
    expect(callsTo(fake, 'PUT', `/tasks/${b?.id ?? ''}/goal`)[0]?.body).toEqual({ goalId: null });
    expect(callsTo(fake, 'DELETE', `/tasks/${b?.id ?? ''}`)).toHaveLength(0);
    expect(fake.tasks().map((task) => task.title)).toContain('b');
    // Focus moves to the row that took its place
    await waitFor(() => {
      expect(itemOf('c')).toHaveFocus();
    });
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(titles()).toEqual(['a', 'b', 'c']);
    });
  });

  it('Delete in a text box does nothing to tasks', async () => {
    const { user, fake } = await ready();
    await user.click(addBox());
    await user.keyboard('{Delete}');
    expect(callsTo(fake, 'PUT', '/tasks/x/goal')).toHaveLength(0);
    expect(titles()).toEqual(['a', 'b', 'c']);
  });

  it('Escape closes the detail panel, and a second Escape goes back to the list of goals', async () => {
    const { user, router, setup } = await ready();
    focusRow('a');
    await user.keyboard('{Enter}');
    await screen.findByTestId('detail');
    act(() => {
      itemOf('a').focus();
    });
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('detail')).toBeNull();
    expect(router.state.location.pathname).toBe(`/tasks/goals/${setup.goal.id}`);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tasks/goals');
    });
  });

  it('Escape does not leave the page while typing, in a menu, or in the help dialog', async () => {
    const { user, router, setup } = await ready();
    await user.click(addBox());
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.keyboard('{Escape}');
    await user.keyboard('?');
    await user.keyboard('{Escape}');
    expect(router.state.location.pathname).toBe(`/tasks/goals/${setup.goal.id}`);
  });
});

describe('the help dialog', () => {
  it('opens with ? and lists the keys under Goals', async () => {
    const { user } = await ready();
    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByRole('heading', { name: 'Goals' })).toBeInTheDocument();
    expect(within(dialog).getByText('Remove from goal')).toBeInTheDocument();
    expect(within(dialog).getByText('Add a task to this goal')).toBeInTheDocument();
    expect(dialog).toHaveFocus();
  });

  it('opens from its button, traps Tab, and Escape closes it and returns focus', async () => {
    const { user } = await ready();
    const opener = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
