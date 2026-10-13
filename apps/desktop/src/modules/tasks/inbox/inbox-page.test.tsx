import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePalette } from '../../../store/palette-store';
import { useSettings } from '../../../store/settings-store';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, makeTag, makeTask, type FakeApi } from '../../../test/fake-api';
import { useTasksUi } from '../tasks-ui-store';
import {
  addBox,
  findToast,
  itemOf,
  items,
  openMyTasks,
  resetEverything,
  restoreEverything,
  titles,
} from '../my-tasks/test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../detail/task-detail-panel', () => ({
  TaskDetailPanel: ({ taskId }: { taskId: string }) => <aside data-testid="detail">{taskId}</aside>,
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

// "Now" is 3 PM on Tuesday 7 October 2025 in India
const TODAY = '2025-10-06T18:30:00.000Z';
const TOMORROW = '2025-10-07T18:30:00.000Z';
const NEXT_MONDAY = '2025-10-12T18:30:00.000Z';

const three = () =>
  createFakeApi(
    [
      makeTask({ title: 'One', position: 1 }),
      makeTask({ title: 'Two', position: 2 }),
      makeTask({ title: 'Three', position: 3 }),
    ],
    [makeTag({ name: 'work' }), makeTag({ name: 'home' })],
  );

async function openInbox(fake: FakeApi = three()) {
  const opened = await openMyTasks(fake, '/tasks/inbox');
  return opened;
}

const idOf = (fake: FakeApi, title: string) => {
  const found = fake.tasks().find((task) => task.title === title);
  if (!found) throw new Error(`No task ${title}`);
  return found.id;
};
const callsTo = (fake: FakeApi, method: string, path: string) =>
  fake.calls.filter((call) => call.method === method && call.path === path);
const rowButton = (title: string, name: string) =>
  within(itemOf(title)).getByRole('button', { name });
const focusRow = (title: string) => {
  act(() => {
    itemOf(title).focus();
  });
};

describe('the Inbox list', () => {
  it('shows only top-level open tasks with no date and no tag, in the server order', async () => {
    const tag = makeTag({ name: 'work' });
    const parent = makeTask({ title: 'Parent', position: 1 });
    const fake = createFakeApi(
      [
        parent,
        makeTask({ title: 'Sub', parentTaskId: parent.id, position: 2 }),
        makeTask({ title: 'Dated', dueAt: '2025-10-08T00:00:00.000Z', position: 3 }),
        makeTask({
          title: 'Tagged',
          tags: [{ id: tag.id, name: tag.name, color: tag.color }],
          position: 4,
        }),
        makeTask({ title: 'Finished', status: 'done', position: 5 }),
        makeTask({ title: 'Old', archivedAt: '2025-10-02T00:00:00.000Z', position: 6 }),
        makeTask({ title: 'Last', position: 7 }),
      ],
      [tag],
    );
    await openInbox(fake);
    await screen.findByText('Parent');
    expect(titles()).toEqual(['Parent', 'Last']);
  });

  it('has the title, the count, the hint, and no view, filter, sort or group controls', async () => {
    await openInbox();
    expect(await screen.findByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByText('3 to sort')).toBeInTheDocument();
    expect(screen.getByText('Give each task a date or a tag to file it.')).toBeInTheDocument();
    for (const name of ['Filter', 'Sort', 'Group']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('radio', { name: 'Cards' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-drag-handle]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('announces the count in a polite status line', async () => {
    await openInbox();
    expect(await screen.findByText('3 to sort')).toHaveAttribute('role', 'status');
  });

  it('says "1 to sort" for one task', async () => {
    await openInbox(createFakeApi([makeTask({ title: 'Only' })]));
    expect(await screen.findByText('1 to sort')).toBeInTheDocument();
  });

  it('focuses the quick add box, and N focuses it again', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    expect(addBox()).toHaveFocus();
    focusRow('One');
    await user.keyboard('n');
    expect(addBox()).toHaveFocus();
    expect(addBox()).toHaveValue('');
  });

  it('keeps one Tab stop in the list, with its quick actions', async () => {
    await openInbox();
    await screen.findByText('One');
    const stops = items().map((row) => row.tabIndex);
    expect(stops).toEqual([0, -1, -1]);
    expect(rowButton('One', 'Today')).toHaveAttribute('tabindex', '0');
    expect(rowButton('Two', 'Today')).toHaveAttribute('tabindex', '-1');
  });

  it('shows the quick actions with names, and keeps them visible on the selected row', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    for (const name of ['Today', 'Date…', 'Tag…', 'More']) {
      expect(rowButton('One', name)).toBeInTheDocument();
    }
    expect(within(itemOf('Two')).queryByRole('button', { name: /Delete/ })).toBeNull();
    const actionsOf = (title: string) =>
      itemOf(title).querySelector<HTMLElement>('[data-quick-actions]');
    expect(actionsOf('One')).toHaveClass('opacity-0');
    await user.click(itemOf('One'));
    expect(actionsOf('One')).toHaveClass('opacity-100');
    expect(actionsOf('Two')).toHaveClass('opacity-0');
  });
});

describe('the quick actions', () => {
  it('Today gives the task today (all day), and the row leaves with an Undo toast', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('Two');
    await user.click(rowButton('Two', 'Today'));
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Three']);
    });
    expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'Two')}/move`)[0]?.body).toEqual({
      dueAt: TODAY,
      dueAllDay: true,
    });
    const toast = await findToast('Task moved.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Two', 'Three']);
    });
    expect(callsTo(fake, 'POST', '/undo')).toHaveLength(1);
  });

  it('Date… offers Today, Tomorrow and Next week (Monday)', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');

    await user.click(rowButton('One', 'Date…'));
    const menu = screen.getByRole('menu', { name: 'Date' });
    await user.click(within(menu).getByRole('menuitem', { name: 'Tomorrow' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'One')}/move`)[0]?.body).toEqual({
      dueAt: TOMORROW,
      dueAllDay: true,
    });

    await user.click(rowButton('Two', 'Date…'));
    await user.click(screen.getByRole('menuitem', { name: 'Next week (Monday)' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Three']);
    });
    expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'Two')}/move`)[0]?.body).toEqual({
      dueAt: NEXT_MONDAY,
      dueAllDay: true,
    });

    await user.click(rowButton('Three', 'Date…'));
    await user.click(screen.getByRole('menuitem', { name: 'Today' }));
    await waitFor(() => {
      expect(titles()).toEqual([]);
    });
    expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'Three')}/move`)[0]?.body).toMatchObject({
      dueAt: TODAY,
    });
  });

  it('the date box takes today or later, with a message for an earlier day or no day', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Date…'));
    const box = screen.getByLabelText('Pick a date');
    expect(box).toHaveAttribute('min', '2025-10-07');

    await user.click(screen.getByRole('menuitem', { name: 'Set date' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a date.');

    fireEvent.change(box, { target: { value: '2025-10-06' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Set date' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick today or a later date.');
    expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'One')}/move`)).toHaveLength(0);
    expect(titles()).toEqual(['One', 'Two', 'Three']);

    fireEvent.change(box, { target: { value: '2025-10-20' } });
    box.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'One')}/move`)[0]?.body).toEqual({
      dueAt: '2025-10-19T18:30:00.000Z',
      dueAllDay: true,
    });
  });

  it('Tag… gives an existing tag, the row leaves, and Undo brings it back', async () => {
    const fake = three();
    const work = fake.tags().find((tag) => tag.name === 'work');
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Tag…'));
    const menu = screen.getByRole('menu', { name: 'Tags' });
    expect(within(menu).getByRole('textbox', { name: 'Search tags' })).toHaveFocus();
    await user.click(within(menu).getByRole('menuitem', { name: 'work' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    expect(callsTo(fake, 'PATCH', `/tasks/${idOf(fake, 'One')}`)[0]?.body).toEqual({
      tagIds: [work?.id],
    });
    const toast = await findToast('Tag added.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Two', 'Three']);
    });
  });

  it('the tag search narrows the list, and Enter picks an exact match', async () => {
    const fake = three();
    const home = fake.tags().find((tag) => tag.name === 'home');
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Tag…'));
    await user.keyboard('HOM');
    const menu = screen.getByRole('menu', { name: 'Tags' });
    expect(within(menu).queryByRole('menuitem', { name: 'work' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'home' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Create #HOM' })).toBeInTheDocument();
    await user.keyboard('E{Enter}');
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    expect(callsTo(fake, 'PATCH', `/tasks/${idOf(fake, 'One')}`)[0]?.body).toEqual({
      tagIds: [home?.id],
    });
    expect(callsTo(fake, 'POST', '/tags')).toHaveLength(0);
  });

  it('a new name creates the tag, then gives it to the task', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Tag…'));
    await user.keyboard('#Garden');
    await user.click(screen.getByRole('menuitem', { name: 'Create #Garden' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    const created = fake.tags().find((tag) => tag.name === 'Garden');
    expect(created).toBeDefined();
    expect(callsTo(fake, 'POST', '/tags')[0]?.body).toEqual({ name: 'Garden' });
    expect(callsTo(fake, 'PATCH', `/tasks/${idOf(fake, 'One')}`)[0]?.body).toEqual({
      tagIds: [created?.id],
    });
    expect(await findToast('Tag added.')).toBeInTheDocument();
  });

  it('keeps the new tag when giving it to the task fails', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Tag…'));
    await user.keyboard('Garden');
    fake.failNext(500, 'internal', 'Could not tag that task', `/tasks/${idOf(fake, 'One')}`);
    await user.keyboard('{Enter}');
    expect(await findToast('Could not tag that task')).toBeInTheDocument();
    expect(fake.tags().some((tag) => tag.name === 'Garden')).toBe(true);
    expect(titles()).toEqual(['One', 'Two', 'Three']);
  });

  it('a failed tag create changes nothing and keeps the picker open', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Tag…'));
    await user.keyboard('Garden');
    fake.failNext(500, 'internal', 'Could not make the tag', '/tags');
    await user.keyboard('{Enter}');
    expect(await findToast('Could not make the tag')).toBeInTheDocument();
    expect(callsTo(fake, 'PATCH', `/tasks/${idOf(fake, 'One')}`)).toHaveLength(0);
    expect(screen.getByRole('menu', { name: 'Tags' })).toBeInTheDocument();
    expect(titles()).toEqual(['One', 'Two', 'Three']);
  });

  it('does not pull focus back to the list when focus left the row while the tag was made', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Tag…'));
    await user.keyboard('Garden');
    fake.slow(200);
    await user.keyboard('{Enter}');
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    expect(itemOf('Two')).not.toHaveFocus();
  });

  it('refuses a tag name the server would refuse, and keeps the picker open', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Tag…'));
    await user.keyboard('two words{Enter}');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(titles()).toEqual(['One', 'Two', 'Three']);
    expect(screen.getByRole('menu', { name: 'Tags' })).toBeInTheDocument();
  });

  it('More sets the priority and the row stays', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'More'));
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((el) => el.textContent),
    ).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(within(menu).getByRole('menuitemradio', { name: 'Low' })).toBeChecked();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Urgent' }));
    await waitFor(() => {
      expect(callsTo(fake, 'PATCH', `/tasks/${idOf(fake, 'One')}`)[0]?.body).toEqual({
        priority: 1,
      });
    });
    expect(titles()).toEqual(['One', 'Two', 'Three']);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('groups the priorities under the visible Priority heading', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.click(rowButton('One', 'More'));
    const group = screen.getByRole('group', { name: 'Priority' });
    expect(within(group).getAllByRole('menuitemradio')).toHaveLength(4);
  });

  it('reaches Set date with Tab from the date box without closing the menu', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'Date…'));
    const box = screen.getByLabelText('Pick a date');
    await user.click(box);
    fireEvent.change(box, { target: { value: '2025-10-20' } });
    await user.tab();
    const set = screen.getByRole('menuitem', { name: 'Set date' });
    expect(set).toHaveFocus();
    expect(screen.getByRole('menu', { name: 'Date' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'One')}/move`)).toHaveLength(1);
    });
  });

  it('opens a menu upward when the bottom of the area would cut it off', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute('role') === 'menu' ? rect(700, 900) : rect(600, 630);
    });
    await user.click(rowButton('One', 'More'));
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(menu.style.bottom).toBe('100%');
    expect(menu.style.top).toBe('auto');
  });

  it('keeps a menu below its button when there is room', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.click(rowButton('One', 'More'));
    expect(screen.getByRole('menu', { name: 'More actions' }).style.bottom).toBe('');
  });

  it('More archives and deletes, each with an Undo toast', async () => {
    const fake = three();
    const twoId = idOf(fake, 'Two');
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'More'));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Two', 'Three']);
    });
    expect(callsTo(fake, 'POST', `/tasks/${idOf(fake, 'One')}/archive`)).toHaveLength(1);
    expect(await findToast('Task archived.')).toBeInTheDocument();

    await user.click(rowButton('Two', 'More'));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Three']);
    });
    expect(callsTo(fake, 'DELETE', `/tasks/${twoId}`)).toHaveLength(1);
    expect(await findToast('Task deleted.')).toBeInTheDocument();
  });

  it('puts the row back with the error message when the server refuses', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('Two');
    fake.failNext(400, 'validation_error', 'Cannot move that task', true);
    await user.click(rowButton('Two', 'Today'));
    expect(await findToast('Cannot move that task')).toBeInTheDocument();
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Two', 'Three']);
    });
  });

  it('Escape closes a menu and returns to its button', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.click(rowButton('One', 'Date…'));
    expect(screen.getByRole('menu', { name: 'Date' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(rowButton('One', 'Date…')).toHaveFocus();
  });

  it('clicking an action does not open the details', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.click(rowButton('One', 'Date…'));
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    expect(useTasksUi.getState().selectedTaskId).toBeNull();
  });
});

describe('focus after a row leaves', () => {
  it('moves to the row that took its place, with the keyboard only', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    focusRow('Two');
    await user.keyboard('t');
    expect(screen.getByRole('menu', { name: 'Date' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Three']);
    });
    await waitFor(() => {
      expect(itemOf('Three')).toHaveFocus();
    });
  });

  it('moves to the previous row when the last row leaves', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    focusRow('Three');
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Two']);
    });
    await waitFor(() => {
      expect(itemOf('Two')).toHaveFocus();
    });
  });

  it('works through the whole inbox with T and Enter', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    focusRow('One');
    for (const expected of [['Two', 'Three'], ['Three'], []]) {
      await user.keyboard('t');
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(titles()).toEqual(expected);
      });
      const first = expected[0];
      if (first !== undefined) {
        await waitFor(() => {
          expect(itemOf(first)).toHaveFocus();
        });
      }
    }
    expect(callsTo(fake, 'POST', '/undo')).toHaveLength(0);
    expect(await screen.findByText('Your inbox is empty')).toBeInTheDocument();
  });
});

describe('the Inbox keys', () => {
  it('T opens the date menu and L the tag picker of the focused row', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    focusRow('Two');
    await user.keyboard('t');
    expect(within(itemOf('Two')).getByRole('menu', { name: 'Date' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    focusRow('Two');
    await user.keyboard('L');
    expect(screen.getByRole('textbox', { name: 'Search tags' })).toHaveFocus();
    expect(within(itemOf('Two')).getByRole('menu', { name: 'Tags' })).toBeInTheDocument();
  });

  it('1 to 4 set the priority of the focused row', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    focusRow('Two');
    for (const [key, priority] of [
      ['1', 1],
      ['2', 2],
      ['3', 3],
    ] as const) {
      await user.keyboard(key);
      await waitFor(() => {
        expect(fake.tasks().find((task) => task.title === 'Two')?.priority).toBe(priority);
      });
    }
    await user.keyboard('4');
    await waitFor(() => {
      expect(
        callsTo(fake, 'PATCH', `/tasks/${idOf(fake, 'Two')}`).map((call) => call.body),
      ).toEqual([{ priority: 1 }, { priority: 2 }, { priority: 3 }, { priority: 4 }]);
    });
    expect(titles()).toEqual(['One', 'Two', 'Three']);
  });

  it('does nothing with Ctrl, Alt or Meta', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    focusRow('One');
    await user.keyboard('{Control>}1{/Control}');
    await user.keyboard('{Alt>}t{/Alt}');
    await user.keyboard('{Meta>}l{/Meta}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(callsTo(fake, 'PATCH', `/tasks/${idOf(fake, 'One')}`)).toHaveLength(0);
  });

  it('does nothing while typing in the quick add box', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.type(addBox(), 't1l');
    expect(addBox()).toHaveValue('t1l');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });

  it('does nothing inside an open menu, or when no row is focused', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(rowButton('One', 'More'));
    await user.keyboard('2');
    await user.keyboard('t');
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
    expect(screen.queryByRole('menu', { name: 'Date' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    await user.keyboard('t');
    await user.keyboard('3');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });

  it('does nothing while the command palette is open', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    focusRow('One');
    act(() => {
      usePalette.setState({ open: true });
    });
    await user.keyboard('1');
    await user.keyboard('t');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });

  it('does nothing while a dialog is open', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await user.keyboard('1');
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
    expect(dialog).toBeInTheDocument();
  });

  it('does nothing while focus is in the detail panel', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('One');
    await user.click(itemOf('One'));
    const panel = await screen.findByTestId('detail');
    panel.tabIndex = -1;
    act(() => {
      panel.focus();
    });
    await user.keyboard('1');
    await user.keyboard('t');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });

  it('keeps the My tasks keys: Space, Enter, Delete, Esc, arrows and ?', async () => {
    const fake = three();
    const ids = { One: idOf(fake, 'One'), Two: idOf(fake, 'Two'), Three: idOf(fake, 'Three') };
    const { user } = await openInbox(fake);
    await screen.findByText('One');

    focusRow('One');
    await user.keyboard('{ArrowDown}');
    expect(itemOf('Two')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(itemOf('One')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('detail')).toHaveTextContent(ids.One);
    act(() => {
      itemOf('One').focus();
    });
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();

    focusRow('Two');
    await user.keyboard(' ');
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Three']);
    });
    expect(callsTo(fake, 'POST', `/tasks/${ids.Two}/complete`)).toHaveLength(1);

    focusRow('Three');
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(titles()).toEqual(['One']);
    });
    expect(callsTo(fake, 'DELETE', `/tasks/${ids.Three}`)).toHaveLength(1);

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('the shortcuts help', () => {
  it('lists the My tasks keys and an Inbox group with T, L and 1 to 4', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const group = within(dialog).getByRole('region', { name: 'Inbox' });
    expect(within(group).getByText('Choose a date')).toBeInTheDocument();
    expect(within(group).getByText('Choose a tag')).toBeInTheDocument();
    expect(within(group).getByText(/Priority: Urgent/)).toBeInTheDocument();
    expect(within(dialog).getByText('New task')).toBeInTheDocument();
    expect(within(dialog).getByText('Open details')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the help dialogs keep Tab inside', () => {
  it('Inbox help wraps Tab and returns focus to the ? button on close', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    const opener = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await user.tab();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(opener).toHaveFocus();
  });

  it('My tasks help wraps Tab too', async () => {
    const { user } = await openMyTasks(three(), '/tasks/my-tasks');
    await screen.findByText('One');
    act(() => {
      itemOf('One').focus();
    });
    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await user.tab();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });
});

describe('empty, loading and error states', () => {
  it('shows a quiet empty card with a way to My tasks, and keeps quick add', async () => {
    const { user, router } = await openInbox(
      createFakeApi([makeTask({ title: 'Dated', dueAt: '2025-10-08T00:00:00.000Z' })]),
    );
    expect(await screen.findByText('Your inbox is empty')).toBeInTheDocument();
    expect(
      screen.getByText('Every task has a date or a tag. New tasks without either show up here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/to sort/)).not.toBeInTheDocument();
    expect(screen.queryByText('Give each task a date or a tag to file it.')).toBeNull();
    expect(addBox()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open My tasks' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tasks/my-tasks');
    });
  });

  it('shows Loading tasks… and no empty card while loading', async () => {
    const fake = three();
    fake.slow(200);
    await openInbox(fake);
    expect(await screen.findByText('Loading tasks…')).toHaveAttribute('role', 'status');
    expect(screen.queryByText('Your inbox is empty')).not.toBeInTheDocument();
    expect(screen.queryByText(/to sort/)).not.toBeInTheDocument();
    expect(await screen.findByText('One')).toBeInTheDocument();
  });

  it('shows the server message with Try again, and no empty card', async () => {
    const fake = three();
    fake.failNext(503, 'schema_behind', 'Database update needed: run pnpm db:migrate');
    const { user } = await openInbox(fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Database update needed: run pnpm db:migrate');
    expect(screen.queryByText('Your inbox is empty')).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('One')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a plain sentence when the error has no server message', async () => {
    const fake = three();
    fake.failNext(0, 'network', 'Cannot reach the server.');
    await openInbox(fake);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });
});

describe('quick add on the Inbox page', () => {
  it('a plain task shows up in the list with no toast about My tasks', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.type(addBox(), 'Plain thing{Enter}');
    expect(await screen.findByText('Plain thing')).toBeInTheDocument();
    expect(titles()).toEqual(['One', 'Two', 'Three', 'Plain thing']);
    expect(useToasts.getState().toasts.map((toast) => toast.message)).not.toContain(
      'Added to My tasks.',
    );
  });

  it('a task with a date says it went to My tasks', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.type(addBox(), 'Pay rent tomorrow{Enter}');
    expect(await findToast('Added to My tasks.')).toBeInTheDocument();
    expect(titles()).toEqual(['One', 'Two', 'Three']);
  });

  it('a task with a tag says it went to My tasks', async () => {
    const { user } = await openInbox();
    await screen.findByText('One');
    await user.type(addBox(), 'Call mum #family{Enter}');
    expect(await findToast('Added to My tasks.')).toBeInTheDocument();
    expect(titles()).toEqual(['One', 'Two', 'Three']);
  });
});

describe('the detail panel', () => {
  it('stays open on a task that left the list, until it is closed', async () => {
    const fake = three();
    const { user } = await openInbox(fake);
    await screen.findByText('Two');
    await user.click(itemOf('Two'));
    expect(screen.getByTestId('detail')).toHaveTextContent(idOf(fake, 'Two'));
    await user.click(rowButton('Two', 'Today'));
    await waitFor(() => {
      expect(titles()).toEqual(['One', 'Three']);
    });
    expect(screen.getByTestId('detail')).toHaveTextContent(idOf(fake, 'Two'));
  });
});

describe('looks', () => {
  it.each(['dark', 'light'] as const)(
    'renders in %s mode with theme tokens only',
    async (theme) => {
      useSettings.getState().update({ theme });
      await openInbox();
      await screen.findByText('One');
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
      expect(document.documentElement.innerHTML).not.toMatch(/rgba?\(/);
      for (const el of document.querySelectorAll<HTMLElement>('[data-item-key] *')) {
        expect(el.style.color).toBe('');
        expect(el.style.backgroundColor).toBe('');
      }
    },
  );

  it('the empty state also renders in the light theme', async () => {
    useSettings.getState().update({ theme: 'light' });
    await openInbox(createFakeApi());
    expect(await screen.findByText('Your inbox is empty')).toBeInTheDocument();
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
