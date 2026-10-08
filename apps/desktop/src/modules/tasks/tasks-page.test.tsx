import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../store/settings-store';
import { useToasts } from '../../store/toast-store';
import { createFakeApi, makeTask, type FakeApi } from '../../test/fake-api';
import { signedInAuth } from '../../test/fake-auth';
import { renderApp } from '../../test/render-app';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  useToasts.getState().clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openTasks(fake: FakeApi = createFakeApi()) {
  const router = await renderApp('/tasks', signedInAuth().auth, fake.api);
  return { router, fake, user: userEvent.setup() };
}

const addBox = () => screen.getByRole('textbox', { name: 'New task' });
const row = (title: string) => screen.getByRole('button', { name: `Open: ${title}` }).closest('li');
const inRow = (title: string) => within(row(title) as HTMLElement);
const toastRegion = () => screen.queryByRole('status');

describe('the Tasks screen', () => {
  it('is reached from the Tasks dock icon, titled Tasks, with the add box focused', async () => {
    await openTasks();
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
    expect(addBox()).toHaveFocus();
    expect(addBox()).toHaveAttribute('placeholder', 'Add a task');
  });

  it('shows an empty state with a hint, and no list', async () => {
    await openTasks();
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
    expect(screen.getByText('Nothing left to do')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists To do and Done in separate sections, in order, with a count', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Write report' }),
      makeTask({ title: 'Call mum', status: 'doing' }),
      makeTask({ title: 'Pay rent', status: 'done', completedAt: '2025-10-06T00:00:00.000Z' }),
    ]);
    await openTasks(fake);
    expect(await screen.findByText('Write report')).toBeInTheDocument();
    expect(screen.getByText('2 to do')).toBeInTheDocument();

    const todo = screen.getByRole('region', { name: 'To do' });
    expect(
      within(todo)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('Write report'), expect.stringContaining('Call mum')]);
    expect(within(todo).getByText('In progress')).toBeInTheDocument();

    const done = screen.getByRole('region', { name: 'Done' });
    expect(within(done).getByText('Pay rent')).toHaveClass('line-through');
  });

  it('shows a clear message with a retry when the tasks cannot be loaded', async () => {
    const fake = createFakeApi([makeTask({ title: 'Back again' })]);
    fake.failNext(0, 'network', 'Cannot reach the server. Check that it is running and try again.');
    const { user } = await openTasks(fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('adding a task', () => {
  it('adds on Enter, clears the box, and keeps focus there for the next one', async () => {
    const { user, fake } = await openTasks();
    await screen.findByText(/No tasks yet/);
    await user.type(addBox(), '  Buy milk {Enter}');
    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    expect(addBox()).toHaveValue('');
    expect(addBox()).toHaveFocus();
    expect(fake.calls.filter((call) => call.method === 'POST')).toEqual([
      { method: 'POST', path: '/tasks', body: { title: 'Buy milk' } },
    ]);
    await user.type(addBox(), 'Second{Enter}');
    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(screen.getByText('2 to do')).toBeInTheDocument();
  });

  it('ignores an empty or blank title', async () => {
    const { user, fake } = await openTasks();
    await screen.findByText(/No tasks yet/);
    await user.type(addBox(), '   {Enter}');
    expect(fake.calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('shows the server’s message and keeps nothing half-added when it refuses', async () => {
    const { user, fake } = await openTasks();
    await screen.findByText(/No tasks yet/);
    fake.failNext(400, 'validation_error', 'Title is too long');
    await user.type(addBox(), 'x{Enter}');
    expect(await screen.findByText('Title is too long')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

describe('completing a task', () => {
  it('ticks it off at once, moves it to Done, and offers Undo', async () => {
    const fake = createFakeApi([makeTask({ title: 'Write report' })]);
    const { user } = await openTasks(fake);
    await user.click(await screen.findByRole('checkbox', { name: 'Complete: Write report' }));

    const done = await screen.findByRole('region', { name: 'Done' });
    expect(within(done).getByText('Write report')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Reopen: Write report' })).toBeChecked();
    expect(fake.calls).toContainEqual({
      method: 'POST',
      path: expect.stringMatching(/^\/tasks\/.+\/complete$/) as string,
      body: undefined,
    });

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Task completed.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Complete: Write report' })).not.toBeChecked();
    });
    expect(screen.queryByRole('region', { name: 'Done' })).not.toBeInTheDocument();
    expect(toastRegion()).not.toBeInTheDocument();
  });

  it('reopens a done task when it is unticked', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Old', status: 'done', completedAt: '2025-10-01T00:00:00.000Z' }),
    ]);
    const { user } = await openTasks(fake);
    await user.click(await screen.findByRole('checkbox', { name: 'Reopen: Old' }));
    expect(await screen.findByRole('region', { name: 'To do' })).toHaveTextContent('Old');
    expect(fake.tasks()[0]).toMatchObject({ status: 'todo', completedAt: null });
  });

  it('puts the task back and says why when the server refuses', async () => {
    const fake = createFakeApi([makeTask({ title: 'Stuck' })]);
    const { user } = await openTasks(fake);
    const box = await screen.findByRole('checkbox', { name: 'Complete: Stuck' });
    fake.failNext(409, 'blocked', 'Finish the tasks that block this one first');
    await user.click(box);
    expect(
      await screen.findByText('Finish the tasks that block this one first'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Complete: Stuck' })).not.toBeChecked();
    });
  });
});

describe('deleting a task', () => {
  it('removes it at once and offers Undo, which brings it back', async () => {
    const fake = createFakeApi([makeTask({ title: 'Delete me' }), makeTask({ title: 'Keep me' })]);
    const { user } = await openTasks(fake);
    await screen.findByText('Delete me');
    await user.click(screen.getByRole('button', { name: 'Delete: Delete me' }));
    await waitFor(() => {
      expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Keep me')).toBeInTheDocument();

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Task deleted.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Delete me')).toBeInTheDocument();
  });

  it('closes the details panel when the open task is deleted', async () => {
    const fake = createFakeApi([makeTask({ title: 'Open one' })]);
    const { user } = await openTasks(fake);
    await user.click(await screen.findByRole('button', { name: 'Open: Open one' }));
    const panel = screen.getByRole('complementary', { name: 'Task details' });
    await user.click(within(panel).getByRole('button', { name: 'Delete task' }));
    await waitFor(() => {
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Open one')).not.toBeInTheDocument();
  });

  it('the Undo toast goes away by itself after a few seconds', async () => {
    const fake = createFakeApi([makeTask({ title: 'Temp' })]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms) => {
        vi.advanceTimersByTime(ms);
      },
    });
    await renderApp('/tasks', signedInAuth().auth, fake.api);
    await user.click(await screen.findByRole('button', { name: 'Delete: Temp' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(toastRegion()).not.toBeInTheDocument();
  });
});

describe('the details panel', () => {
  async function openDetails(task = makeTask({ title: 'Plan trip' })) {
    const fake = createFakeApi([task]);
    const { user } = await openTasks(fake);
    await user.click(await screen.findByRole('button', { name: `Open: ${task.title}` }));
    const panel = screen.getByRole('complementary', { name: 'Task details' });
    return { fake, user, panel: within(panel) };
  }

  it('opens beside the list with every field, and closes again', async () => {
    const { panel, user } = await openDetails();
    expect(panel.getByRole('textbox', { name: 'Title' })).toHaveValue('Plan trip');
    expect(panel.getByRole('textbox', { name: 'Description' })).toHaveValue('');
    expect(panel.getByRole('radio', { name: 'To do' })).toBeChecked();
    expect(panel.getByRole('radio', { name: 'Low' })).toBeChecked();
    expect(panel.getByLabelText('Due')).toHaveValue('');
    expect(panel.getByLabelText('Reminder')).toHaveValue('');
    expect(row('Plan trip')).toHaveAttribute('data-selected', 'true');

    await user.click(panel.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(row('Plan trip')).not.toHaveAttribute('data-selected');
  });

  it('clicking the open task again closes the panel', async () => {
    const { user } = await openDetails();
    await user.click(screen.getByRole('button', { name: 'Open: Plan trip' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('saves a renamed title when you leave the field, and the list follows', async () => {
    const { panel, user, fake } = await openDetails();
    const title = panel.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Plan the trip{Enter}');
    expect(await screen.findByRole('button', { name: 'Open: Plan the trip' })).toBeInTheDocument();
    expect(fake.calls).toContainEqual({
      method: 'PATCH',
      path: expect.stringMatching(/^\/tasks\/.+/) as string,
      body: { title: 'Plan the trip' },
    });
  });

  it('puts the old title back when it is emptied, and saves nothing', async () => {
    const { panel, user, fake } = await openDetails();
    const title = panel.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.tab();
    expect(title).toHaveValue('Plan trip');
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toEqual([]);
  });

  it('saves the description on blur, and clears it with an empty field', async () => {
    const { panel, user, fake } = await openDetails();
    const box = panel.getByRole('textbox', { name: 'Description' });
    await user.type(box, 'Book flights first');
    await user.tab();
    await waitFor(() => {
      expect(fake.tasks()[0]?.description).toBe('Book flights first');
    });
    await user.clear(box);
    await user.tab();
    await waitFor(() => {
      expect(fake.tasks()[0]?.description).toBeNull();
    });
  });

  it('changes status and priority at once, and the list shows it', async () => {
    const { panel, user, fake } = await openDetails();
    await user.click(panel.getByRole('radio', { name: 'Urgent' }));
    expect(await screen.findByRole('img', { name: 'Urgent priority' })).toBeInTheDocument();
    await user.click(panel.getByRole('radio', { name: 'Doing' }));
    expect(await inRow('Plan trip').findByText('In progress')).toBeInTheDocument();
    expect(fake.tasks()[0]).toMatchObject({ priority: 1, status: 'doing' });

    await user.click(panel.getByRole('radio', { name: 'Done' }));
    expect(await screen.findByRole('region', { name: 'Done' })).toHaveTextContent('Plan trip');
  });

  it('shows no dot for low priority, and a different dot for each higher one', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'p1', priority: 1 }),
      makeTask({ title: 'p2', priority: 2 }),
      makeTask({ title: 'p3', priority: 3 }),
      makeTask({ title: 'p4', priority: 4 }),
    ]);
    await openTasks(fake);
    await screen.findByText('p1');
    expect(inRow('p1').getByRole('img', { name: 'Urgent priority' })).toBeInTheDocument();
    expect(inRow('p2').getByRole('img', { name: 'High priority' })).toBeInTheDocument();
    expect(inRow('p3').getByRole('img', { name: 'Medium priority' })).toBeInTheDocument();
    expect(inRow('p4').queryByRole('img')).not.toBeInTheDocument();
  });

  it('sets a due date typed in India time, stores it as UTC, and shows it in the list', async () => {
    vi.setSystemTime(new Date('2025-10-07T06:30:00.000Z')); // 12:00 in India
    const { panel, fake } = await openDetails();
    const due = panel.getByLabelText('Due');
    fireEvent.change(due, { target: { value: '2025-10-07T17:00' } });
    // Nothing is saved while typing; the date is saved when the box is left
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toEqual([]);
    fireEvent.blur(due);
    await waitFor(() => {
      expect(fake.tasks()[0]?.dueAt).toBe('2025-10-07T11:30:00.000Z');
    });
    expect(await inRow('Plan trip').findByText(/Today, 5:00 PM/)).toBeInTheDocument();
    expect(panel.getByLabelText('Due')).toHaveValue('2025-10-07T17:00');
  });

  it('marks a past due date as overdue, and clears dates with the clear button', async () => {
    const task = makeTask({
      title: 'Late one',
      dueAt: '2020-01-01T10:00:00.000Z',
      reminderAt: '2020-01-01T09:00:00.000Z',
    });
    const { panel, user, fake } = await openDetails(task);
    expect(inRow('Late one').getByText(/Overdue/)).toBeInTheDocument();
    expect(inRow('Late one').getByText(/Overdue/)).toHaveClass('text-danger');

    await user.click(panel.getByRole('button', { name: 'Clear due' }));
    await user.click(panel.getByRole('button', { name: 'Clear reminder' }));
    await waitFor(() => {
      expect(fake.tasks()[0]).toMatchObject({ dueAt: null, reminderAt: null });
    });
    expect(inRow('Late one').queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it('does not show Overdue for a done task', async () => {
    const task = makeTask({
      title: 'Finished',
      status: 'done',
      dueAt: '2020-01-01T10:00:00.000Z',
      completedAt: '2020-01-01T09:00:00.000Z',
    });
    await openTasks(createFakeApi([task]));
    await screen.findByText('Finished');
    expect(inRow('Finished').queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it('rolls an edit back and explains when the server refuses it', async () => {
    const { panel, user, fake } = await openDetails();
    fake.failNext(400, 'validation_error', 'Priority must be 1 to 4');
    await user.click(panel.getByRole('radio', { name: 'Urgent' }));
    expect(await screen.findByText('Priority must be 1 to 4')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('img', { name: 'Urgent priority' })).not.toBeInTheDocument();
    });
  });
});

describe('keyboard use', () => {
  it('lets you tab to a task, tick it with Space, and open it with Enter', async () => {
    const fake = createFakeApi([makeTask({ title: 'By keyboard' })]);
    const { user } = await openTasks(fake);
    const box = await screen.findByRole('checkbox', { name: 'Complete: By keyboard' });
    box.focus();
    await user.keyboard(' ');
    expect(await screen.findByRole('region', { name: 'Done' })).toBeInTheDocument();

    screen.getByRole('button', { name: 'Open: By keyboard' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeInTheDocument();
  });

  it('shows the delete button for a task that has keyboard focus', async () => {
    const fake = createFakeApi([makeTask({ title: 'Focus me' })]);
    await openTasks(fake);
    const button = await screen.findByRole('button', { name: 'Delete: Focus me' });
    expect(button).toHaveClass('group-focus-within:opacity-100');
  });
});

describe('light and dark', () => {
  it.each(['dark', 'light'] as const)(
    'works in %s mode without hard-coded colors',
    async (theme) => {
      useSettings.getState().update({ theme });
      const fake = createFakeApi([makeTask({ title: 'Themed', priority: 1 })]);
      await openTasks(fake);
      await screen.findByText('Themed');
      const html = document.documentElement.innerHTML;
      expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
      expect(document.documentElement.dataset.theme).toBe(theme);
    },
  );
});

describe('typing a date', () => {
  it('does not save the half-typed years on the way to the final date', async () => {
    const fake = createFakeApi([makeTask({ title: 'Dated' })]);
    const { user } = await openTasks(fake);
    await user.click(await screen.findByRole('button', { name: 'Open: Dated' }));
    const due = screen.getByLabelText('Due');
    for (const typed of ['0002-10-07T17:00', '0020-10-07T17:00', '0202-10-07T17:00']) {
      fireEvent.change(due, { target: { value: typed } });
    }
    fireEvent.change(due, { target: { value: '2026-10-07T17:00' } });
    fireEvent.blur(due);
    await waitFor(() => {
      expect(fake.tasks()[0]?.dueAt).toBe('2026-10-07T11:30:00.000Z');
    });
    expect(fake.calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
  });

  it('saves on Enter too', async () => {
    const fake = createFakeApi([makeTask({ title: 'Dated' })]);
    const { user } = await openTasks(fake);
    await user.click(await screen.findByRole('button', { name: 'Open: Dated' }));
    const due = screen.getByLabelText('Due');
    due.focus();
    fireEvent.change(due, { target: { value: '2026-10-07T17:00' } });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(fake.tasks()[0]?.dueAt).toBe('2026-10-07T11:30:00.000Z');
    });
  });
});
