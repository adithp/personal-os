import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePalette } from '../../../store/palette-store';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { useTasksUi } from '../tasks-ui-store';
import {
  addBox,
  itemOf,
  items,
  openMyTasks,
  resetEverything,
  restoreEverything,
  titles,
} from './test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../detail/task-detail-panel', () => ({
  TaskDetailPanel: ({ taskId }: { taskId: string }) => <aside data-testid="detail">{taskId}</aside>,
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const three = () =>
  createFakeApi([
    makeTask({ title: 'One', position: 1 }),
    makeTask({ title: 'Two', position: 2 }),
    makeTask({ title: 'Three', position: 3 }),
  ]);

async function openThree(list = false) {
  const opened = await openMyTasks(three());
  await screen.findByText('One');
  if (list) await opened.user.click(screen.getByRole('radio', { name: 'List' }));
  return opened;
}

const focusItem = (title: string) => {
  act(() => {
    itemOf(title).focus();
  });
};

/** Pretend the cards sit in a grid of 3 columns, because jsdom has no layout. */
function layOutAsGrid(columns: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = items().indexOf(this);
    const i = Math.max(index, 0);
    return new DOMRect((i % columns) * 200, Math.floor(i / columns) * 100, 180, 80);
  });
}

describe('roving tabindex', () => {
  it('makes exactly one task the Tab stop, and follows focus', async () => {
    await openThree();
    expect(items().filter((el) => el.tabIndex === 0)).toEqual([itemOf('One')]);
    focusItem('Two');
    expect(items().filter((el) => el.tabIndex === 0)).toEqual([itemOf('Two')]);
    // The checkbox inside is not a second stop
    expect(within(itemOf('Two')).getByRole('checkbox')).toHaveAttribute('tabindex', '-1');
  });
});

describe('N', () => {
  it('focuses the quick add box without typing the letter', async () => {
    const { user } = await openThree();
    focusItem('Two');
    await user.keyboard('n');
    expect(addBox()).toHaveFocus();
    expect(addBox()).toHaveValue('');
  });

  it('does nothing in a text box: the letter is typed', async () => {
    const { user } = await openThree();
    await user.type(addBox(), 'n?x ');
    expect(addBox()).toHaveValue('n?x ');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does nothing with Ctrl, Meta, or Alt held', async () => {
    const { user } = await openThree();
    focusItem('Two');
    await user.keyboard('{Control>}n{/Control}');
    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('{Alt>}n{/Alt}');
    expect(itemOf('Two')).toHaveFocus();
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(titles()).toHaveLength(3);
  });

  it('does nothing while the command palette is open', async () => {
    await openThree();
    const two = itemOf('Two');
    act(() => {
      usePalette.getState().setOpen(true);
    });
    for (const key of ['n', '?', 'Delete', ' ', 'Enter']) fireEvent.keyDown(two, { key });
    expect(document.activeElement).not.toBe(document.querySelector('input[aria-label="New task"]'));
    expect(document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')).toBeNull();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    expect(titles()).toHaveLength(3);
    act(() => {
      usePalette.getState().setOpen(false);
    });
    fireEvent.keyDown(two, { key: 'Delete' });
    await waitFor(() => {
      expect(titles()).toHaveLength(2);
    });
  });

  it('does nothing inside an open menu', async () => {
    const { user } = await openThree();
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.keyboard('n');
    expect(addBox()).not.toHaveFocus();
  });
});

describe('arrow keys', () => {
  it('Left and Right move to the previous and next task', async () => {
    const { user } = await openThree();
    focusItem('One');
    await user.keyboard('{ArrowRight}');
    expect(itemOf('Two')).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(itemOf('Three')).toHaveFocus(); // stays on the last
    await user.keyboard('{ArrowLeft}');
    expect(itemOf('Two')).toHaveFocus();
  });

  it('Up and Down move one row in Cards view', async () => {
    layOutAsGrid(2);
    const fake = createFakeApi(
      ['A', 'B', 'C', 'D', 'E'].map((title, i) => makeTask({ title, position: i })),
    );
    const { user } = await openMyTasks(fake);
    await screen.findByText('A');
    focusItem('B'); // row 0, column 1
    await user.keyboard('{ArrowDown}');
    expect(itemOf('D')).toHaveFocus(); // row 1, column 1
    await user.keyboard('{ArrowDown}');
    expect(itemOf('E')).toHaveFocus(); // row 2 has only column 0, so the nearest card is E
  });

  it('Up goes back a row in Cards view', async () => {
    layOutAsGrid(2);
    const fake = createFakeApi(
      ['A', 'B', 'C', 'D'].map((title, i) => makeTask({ title, position: i })),
    );
    const { user } = await openMyTasks(fake);
    await screen.findByText('A');
    focusItem('C');
    await user.keyboard('{ArrowUp}');
    expect(itemOf('A')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(itemOf('A')).toHaveFocus();
  });

  it('Up and Down are previous and next in List view', async () => {
    const { user } = await openThree(true);
    focusItem('One');
    await user.keyboard('{ArrowDown}');
    expect(itemOf('Two')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(itemOf('Two')).toHaveFocus();
  });

  it('an arrow key with nothing focused lands on the first task', async () => {
    const { user } = await openThree();
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    await user.keyboard('{ArrowDown}');
    expect(itemOf('One')).toHaveFocus();
  });

  it('skips tasks in a collapsed section', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Late', dueAt: '2025-10-06T10:00:00.000Z' }),
      makeTask({ title: 'Plain' }),
    ]);
    const { user } = await openMyTasks(fake);
    await screen.findByText('Late');
    await user.click(screen.getByRole('button', { name: /Overdue/ }));
    expect(titles()).toEqual(['Plain']);
    act(() => {
      itemOf('Plain').focus();
    });
    await user.keyboard('{ArrowLeft}');
    expect(itemOf('Plain')).toHaveFocus();
  });
});

describe('Space, Enter, Delete, Escape', () => {
  it('Space completes the focused task and focus moves to its neighbour', async () => {
    const { user } = await openThree();
    focusItem('One');
    await user.keyboard(' ');
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    expect((await screen.findByRole('status')).textContent).toContain('Task completed.');
    await waitFor(() => {
      expect(itemOf('Two')).toHaveFocus();
    });
  });

  it('Space reopens a completed task', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Done', status: 'done', completedAt: '2025-10-06T05:00:00.000Z' }),
    ]);
    const { user } = await openMyTasks(fake);
    await user.click(await screen.findByRole('button', { name: /Completed/ }));
    focusItem('Done');
    await user.keyboard(' ');
    await waitFor(() => {
      expect(fake.tasks()[0]?.status).toBe('todo');
    });
  });

  it('Enter opens the details of the focused task', async () => {
    const { user } = await openThree();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    focusItem('Two');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('detail')).toBeInTheDocument();
    expect(useTasksUi.getState().selectedTaskId).not.toBeNull();
  });

  it('Delete deletes the focused task with an Undo toast and no confirm', async () => {
    const { user } = await openThree();
    focusItem('Two');
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Three']);
    });
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Task deleted.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(itemOf('Three')).toHaveFocus();
    });
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Two', 'Three']);
    });
  });

  it('Delete works in List view too', async () => {
    const { user } = await openThree(true);
    focusItem('Three');
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Two']);
    });
    await waitFor(() => {
      expect(itemOf('Two')).toHaveFocus();
    });
  });

  it('Escape closes the detail panel', async () => {
    const { user } = await openThree();
    focusItem('Two');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('detail')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  });

  it('Escape closes an open menu first and leaves the panel alone', async () => {
    const { user } = await openThree();
    focusItem('Two');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('detail')).toBeInTheDocument();
  });

  it('Space and Delete do nothing while typing in the quick add box', async () => {
    const { user } = await openThree();
    await user.type(addBox(), 'a b{Delete}');
    expect(addBox()).toHaveValue('a b');
    expect(titles()).toHaveLength(3);
  });

  it('Space on the checkbox button toggles once, not twice', async () => {
    const { user } = await openThree();
    const box = within(itemOf('One')).getByRole('checkbox');
    act(() => {
      box.focus();
    });
    await user.keyboard(' ');
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    const completes = (name: string) =>
      screen.queryAllByRole('status').filter((el) => el.textContent.includes(name));
    expect(completes('Task completed.')).toHaveLength(1);
  });
});

describe('the shortcut help', () => {
  it('opens with ? and lists exactly these keys, and Escape closes it', async () => {
    const { user } = await openThree();
    focusItem('One');
    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveFocus();
    expect(
      within(dialog)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual([
      'New task',
      'Move between tasks',
      'Complete or reopen',
      'Open details',
      'Delete',
      'Close',
      'Show this help',
    ]);
    for (const key of ['N', 'Space', 'Enter', 'Delete', 'Esc', '?']) {
      expect(within(dialog).getByLabelText(key)).toBeInTheDocument();
    }
    // Other shortcuts are paused while the popup is open
    await user.keyboard('n');
    expect(addBox()).not.toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(itemOf('One')).toHaveFocus();
  });

  it('also opens from the ? button and closes with its Close button', async () => {
    const { user } = await openThree();
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
