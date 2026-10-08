import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, makeTask, type FakeApi } from '../../../test/fake-api';
import { startOfIstDay } from '../dates';
import { NOT_MANUAL_MESSAGE } from '../drag/resolve-drop';
import { useTasksUi } from '../tasks-ui-store';
import {
  findToast,
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

const TODAY_9AM = '2025-10-07T03:30:00.000Z';
const NEXT_WEEK = '2025-10-14T18:30:00.000Z';
const YESTERDAY = '2025-10-05T18:30:00.000Z';
const TODAY_START = startOfIstDay(Date.parse('2025-10-07T09:30:00.000Z'));

/** jsdom has no layout: each section is a 400 px band, and its cards stack inside it. */
function layOut() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const sections = [...document.querySelectorAll('section[aria-label]')];
    if (this.matches('section[aria-label]')) {
      return new DOMRect(0, sections.indexOf(this) * 400, 600, 380);
    }
    // The copy that follows the pointer starts exactly where the card that was lifted sits
    const card = this.matches('[data-drag-overlay]')
      ? document.querySelector('[data-item-key].opacity-40')
      : this;
    const section = card?.closest('section');
    if (card && section && card.matches('[data-item-key]')) {
      const index = [...section.querySelectorAll('[data-item-key]')].indexOf(card);
      return new DOMRect(0, sections.indexOf(section) * 400 + 40 + index * 50, 600, 40);
    }
    return new DOMRect(0, 0, 0, 0);
  });
}

const handleOf = (title: string) => screen.getByRole('button', { name: `Drag ${title}` });
const spoken = () =>
  screen
    .getAllByRole('status')
    .map((el) => el.textContent)
    .join(' | ');

/** Lifts a task with Space on its handle and waits until dnd-kit listens for the arrows. */
async function lift(user: ReturnType<typeof userEvent.setup>, title: string) {
  act(() => {
    handleOf(title).focus();
  });
  await user.keyboard(' ');
  await waitFor(() => {
    // The "picked up" sentence is replaced at once by where the task is
    expect(spoken()).toMatch(new RegExp(`Picked up ${title}|${title} is over`));
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
}

/** Presses an arrow until the spoken text says the lifted task is over `where`. */
async function moveOver(user: ReturnType<typeof userEvent.setup>, key: string, where: RegExp) {
  for (let step = 0; step < 14; step += 1) {
    if (where.test(spoken())) return;
    await user.keyboard(`{${key}}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Never got over ${String(where)}. Heard: ${spoken()}`);
}

const moves = (fake: FakeApi) => fake.calls.filter((call) => call.path.endsWith('/move'));

async function open(tasks = [] as ReturnType<typeof makeTask>[], list = false) {
  const opened = await openMyTasks(createFakeApi(tasks));
  await screen.findByRole('region', { name: 'Today' });
  if (list) await opened.user.click(screen.getByRole('radio', { name: 'List' }));
  layOut();
  return opened;
}

describe('every card and row has a drag handle', () => {
  it('shows one handle per card in Cards and per row in List', async () => {
    const { user } = await open([makeTask({ title: 'One' }), makeTask({ title: 'Two' })]);
    expect(screen.getAllByRole('button', { name: /^Drag / })).toHaveLength(2);
    await user.click(screen.getByRole('radio', { name: 'List' }));
    expect(within(itemOf('One')).getByRole('button', { name: 'Drag One' })).toBeInTheDocument();
  });

  it('only the handle of the Tab stop can be reached with Tab', async () => {
    await open([makeTask({ title: 'One' }), makeTask({ title: 'Two' })]);
    expect(handleOf('One')).toHaveAttribute('tabindex', '0');
    expect(handleOf('Two')).toHaveAttribute('tabindex', '-1');
  });

  it('has none in the Archived view', async () => {
    await openMyTasks(
      createFakeApi([makeTask({ title: 'Old', archivedAt: '2025-10-01T00:00:00.000Z' })]),
      '/tasks/my-tasks?archived=true',
    );
    await screen.findByRole('checkbox', { name: 'Complete: Old' });
    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
  });
});

describe('the handle and the card shortcuts', () => {
  it('Space on the handle lifts the card instead of completing it, and does not open it', async () => {
    const { user, fake } = await open([makeTask({ title: 'One' })]);
    await lift(user, 'One');
    expect(fake.calls.some((call) => call.path.endsWith('/complete'))).toBe(false);
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(spoken()).toContain('Dragging One was cancelled.');
    });
    expect(fake.calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
    expect(titles()).toEqual(['One']);
  });

  it('Space on the card itself still completes it', async () => {
    const { user, fake } = await open([makeTask({ title: 'One' })]);
    act(() => {
      itemOf('One').focus();
    });
    await user.keyboard(' ');
    await waitFor(() => {
      expect(fake.tasks()[0]?.status).toBe('done');
    });
  });
});

describe('moving between sections with the keyboard', () => {
  it('No date to Today sets today all-day, before the card it lands on, with an Undo toast', async () => {
    const dueToday = makeTask({ title: 'Due today', dueAt: TODAY_9AM, position: 10 });
    const loose = makeTask({ title: 'Loose', position: 20 });
    const { user, fake } = await open([dueToday, loose]);
    await lift(user, 'Loose');
    await moveOver(user, 'ArrowUp', /over Due today in Today/);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]).toMatchObject({
      method: 'POST',
      path: `/tasks/${loose.id}/move`,
      body: { dueAt: TODAY_START, dueAllDay: true, beforeId: dueToday.id },
    });
    const toast = await findToast('Task moved.');
    expect(within(toast).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Today' })).getByText('Loose'),
      ).toBeVisible();
    });
    // The keyboard keeps its place on the moved card
    await waitFor(() => {
      expect(handleOf('Loose')).toHaveFocus();
    });
  });

  it('Today keeps the time of a task that has one', async () => {
    const timed = makeTask({ title: 'Timed', dueAt: '2025-10-20T08:00:00.000Z' });
    const { user, fake } = await open([timed, makeTask({ title: 'Anchor', dueAt: TODAY_9AM })]);
    await lift(user, 'Timed');
    await moveOver(user, 'ArrowUp', /over Anchor in Today/);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]?.body).toMatchObject({
      dueAt: '2025-10-07T08:00:00.000Z',
      dueAllDay: false,
    });
  });

  it('works in List view too', async () => {
    const dueToday = makeTask({ title: 'Due today', dueAt: TODAY_9AM, position: 10 });
    const loose = makeTask({ title: 'Loose', position: 20 });
    const { user, fake } = await open([dueToday, loose], true);
    await lift(user, 'Loose');
    await moveOver(user, 'ArrowUp', /over Due today in Today/);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]?.body).toMatchObject({ dueAllDay: true, beforeId: dueToday.id });
  });

  it('Completed completes the task', async () => {
    const todo = makeTask({ title: 'Finish', dueAt: TODAY_9AM });
    const { user, fake } = await open([todo]);
    await lift(user, 'Finish');
    await moveOver(user, 'ArrowDown', /over Completed/);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]).toMatchObject({
      path: `/tasks/${todo.id}/move`,
      body: { status: 'done' },
    });
    await waitFor(() => {
      expect(fake.tasks()[0]?.status).toBe('done');
    });
  });

  it('a completed task dragged to Today is reopened', async () => {
    const finished = makeTask({
      title: 'Finished',
      status: 'done',
      completedAt: '2025-10-06T05:00:00.000Z',
    });
    const { user, fake } = await open([finished, makeTask({ title: 'Anchor', dueAt: TODAY_9AM })]);
    await user.click(screen.getByRole('button', { name: /Completed/ }));
    await lift(user, 'Finished');
    await moveOver(user, 'ArrowUp', /over Anchor in Today/);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]?.body).toMatchObject({ status: 'todo', dueAllDay: true });
    await waitFor(() => {
      expect(fake.tasks().find((task) => task.id === finished.id)).toMatchObject({
        status: 'todo',
        completedAt: null,
      });
    });
  });

  it('Overdue accepts no drops: the message shows and nothing is sent', async () => {
    const { user, fake } = await open([
      makeTask({ title: 'Late', dueAt: YESTERDAY, dueAllDay: true, position: 10 }),
      makeTask({ title: 'Loose', position: 20 }),
    ]);
    await lift(user, 'Loose');
    await moveOver(user, 'ArrowUp', /over Late in Overdue/);
    expect(screen.getByRole('region', { name: 'Overdue' })).not.toHaveClass('ring-1');
    await user.keyboard(' ');
    expect(await findToast('Overdue is only for tasks that are past their date.')).toBeVisible();
    expect(useToasts.getState().toasts.at(-1)?.tone).toBe('error');
    expect(moves(fake)).toHaveLength(0);
    expect(titles()).toContain('Loose');
  });

  it('highlights the section it is over (not Overdue)', async () => {
    const { user } = await open([
      makeTask({ title: 'Due today', dueAt: TODAY_9AM, position: 10 }),
      makeTask({ title: 'Loose', position: 20 }),
    ]);
    await lift(user, 'Loose');
    await moveOver(user, 'ArrowUp', /over Due today in Today/);
    expect(screen.getByRole('region', { name: 'Today' })).toHaveClass('ring-1');
    expect(screen.getByRole('region', { name: 'No date' })).not.toHaveClass('ring-1');
  });
});

describe('Upcoming asks for a date', () => {
  const setup = async () => {
    const loose = makeTask({ title: 'Loose', position: 20 });
    const opened = await open([
      makeTask({ title: 'Soon', dueAt: NEXT_WEEK, dueAllDay: true, position: 10 }),
      loose,
    ]);
    await lift(opened.user, 'Loose');
    await moveOver(opened.user, 'ArrowUp', /over Soon in Upcoming/);
    await opened.user.keyboard(' ');
    return { ...opened, loose };
  };

  it('sends the move with the chosen day, all-day, after Move', async () => {
    const { user, fake, loose } = await setup();
    const dialog = await screen.findByRole('dialog', { name: 'Move to Upcoming: Loose' });
    const box = within(dialog).getByLabelText('Due date');
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('min', '2025-10-08');
    expect(moves(fake)).toHaveLength(0);
    fireEvent.change(box, { target: { value: '2025-10-20' } });
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]).toMatchObject({
      path: `/tasks/${loose.id}/move`,
      body: { dueAt: '2025-10-19T18:30:00.000Z', dueAllDay: true },
    });
    expect(screen.queryByRole('dialog', { name: /Move to Upcoming/ })).not.toBeInTheDocument();
  });

  it('Enter confirms the suggested day (tomorrow)', async () => {
    const { user, fake } = await setup();
    await screen.findByRole('dialog', { name: 'Move to Upcoming: Loose' });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]?.body).toMatchObject({ dueAt: '2025-10-07T18:30:00.000Z' });
  });

  it('refuses today or the past', async () => {
    const { user, fake } = await setup();
    const dialog = await screen.findByRole('dialog', { name: 'Move to Upcoming: Loose' });
    fireEvent.change(within(dialog).getByLabelText('Due date'), {
      target: { value: '2025-10-07' },
    });
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();
    expect(within(dialog).getByText('Pick a day after today.')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(moves(fake)).toHaveLength(0);
  });

  it('Escape sends nothing and leaves the card where it was', async () => {
    const { user, fake } = await setup();
    await screen.findByRole('dialog', { name: 'Move to Upcoming: Loose' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /Move to Upcoming/ })).not.toBeInTheDocument();
    expect(moves(fake)).toHaveLength(0);
    expect(
      within(screen.getByRole('region', { name: 'No date' })).getByText('Loose'),
    ).toBeVisible();
  });

  it('Cancel sends nothing', async () => {
    const { user, fake } = await setup();
    const dialog = await screen.findByRole('dialog', { name: 'Move to Upcoming: Loose' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: /Move to Upcoming/ })).not.toBeInTheDocument();
    expect(moves(fake)).toHaveLength(0);
  });
});

describe('reordering', () => {
  const three = () => [
    makeTask({ title: 'A', position: 1000 }),
    makeTask({ title: 'B', position: 2000 }),
    makeTask({ title: 'C', position: 3000 }),
  ];

  it('in Manual sort sends the neighbours', async () => {
    const tasks = three();
    const [a, , c] = tasks;
    const { user, fake } = await open(tasks);
    await lift(user, 'A');
    await moveOver(user, 'ArrowDown', /over C/);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(moves(fake)).toHaveLength(1);
    });
    expect(moves(fake)[0]).toMatchObject({
      path: `/tasks/${a?.id ?? ''}/move`,
      body: { afterId: c?.id },
    });
    await waitFor(() => {
      expect(titles()).toEqual(['B', 'C', 'A']);
    });
  });

  it('when Sort is not Manual shows one hint and refuses with a toast', async () => {
    useTasksUi.getState().setSort('title');
    const { user, fake } = await open(three());
    expect(screen.getAllByText(NOT_MANUAL_MESSAGE)).toHaveLength(1);
    await lift(user, 'A');
    await moveOver(user, 'ArrowDown', /over C/);
    await user.keyboard(' ');
    expect(await findToast(NOT_MANUAL_MESSAGE)).toBeVisible();
    expect(moves(fake)).toHaveLength(0);
    expect(titles()).toEqual(['A', 'B', 'C']);
  });

  it('shows no hint in Manual sort or in the Archived view', async () => {
    const { user } = await open(three());
    expect(screen.queryByText(NOT_MANUAL_MESSAGE)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Title' }));
    expect(screen.getByText(NOT_MANUAL_MESSAGE)).toBeInTheDocument();
  });

  it('hides the hint while looking at archived tasks', async () => {
    useTasksUi.getState().setSort('title');
    await openMyTasks(createFakeApi(three()), '/tasks/my-tasks?archived=true');
    await screen.findByText('No archived tasks.');
    expect(screen.queryByText(NOT_MANUAL_MESSAGE)).not.toBeInTheDocument();
  });
});

describe('announcements and a refused move', () => {
  it('say what is picked up, where it is, and where it was dropped', async () => {
    const { user } = await open([
      makeTask({ title: 'Due today', dueAt: TODAY_9AM, position: 10 }),
      makeTask({ title: 'Loose', position: 20 }),
    ]);
    await lift(user, 'Loose');
    await moveOver(user, 'ArrowUp', /Loose is over Due today in Today\./);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(spoken()).toContain('Dropped Loose on Due today in Today.');
    });
  });

  it('a refused move shows the server message and the card goes back', async () => {
    const todo = makeTask({ title: 'Finish', dueAt: TODAY_9AM });
    const { user, fake } = await open([todo]);
    fake.failNext(409, 'blocked', 'Finish a blocker first.');
    await lift(user, 'Finish');
    await moveOver(user, 'ArrowDown', /over Completed/);
    await user.keyboard(' ');
    expect(await findToast('Finish a blocker first.')).toBeVisible();
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Today' })).getByText('Finish'),
      ).toBeVisible();
    });
    expect(items()).toHaveLength(1);
  });
});
