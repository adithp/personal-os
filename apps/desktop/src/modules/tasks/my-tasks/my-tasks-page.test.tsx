import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { createFakeApi, makeTag, makeTask } from '../../../test/fake-api';
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

// The detail panel is built by another agent; here it is a marker with a close button
vi.mock('../detail/task-detail-panel', () => ({
  TaskDetailPanel: ({ taskId, onClose }: { taskId: string; onClose: () => void }) => (
    <aside data-testid="detail" data-task={taskId}>
      <button type="button" onClick={onClose}>
        Close details
      </button>
    </aside>
  ),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

type User = ReturnType<typeof userEvent.setup>;

/** Opens a toolbar menu and chooses one item. */
async function choose(user: User, menu: string, item: string, role = 'menuitemradio') {
  await user.click(screen.getByRole('button', { name: menu }));
  await user.click(await screen.findByRole(role, { name: item }));
}

const TODAY_9AM = '2025-10-07T03:30:00.000Z';
const TODAY_5PM = '2025-10-07T11:30:00.000Z';
const YESTERDAY = '2025-10-06T10:00:00.000Z';
const TOMORROW = '2025-10-08T10:00:00.000Z';

describe('sections by India date', () => {
  it('puts overdue, today, upcoming, no date, and completed tasks in their own sections', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Late', dueAt: YESTERDAY }),
      makeTask({ title: 'Morning', dueAt: TODAY_9AM }),
      makeTask({ title: 'Next', dueAt: TOMORROW }),
      makeTask({ title: 'Someday' }),
      makeTask({ title: 'Finished', status: 'done', completedAt: '2025-10-06T05:00:00.000Z' }),
    ]);
    const { user } = await openMyTasks(fake);
    await screen.findByText('Late');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Overdue1', 'Today1', 'Upcoming1', 'No date1', 'Completed1']);
    expect(within(screen.getByRole('region', { name: 'Overdue' })).getByText('Late')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Upcoming' })).getByText('Next'),
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'No date' })).getByText('Someday'),
    ).toBeVisible();

    // Completed starts collapsed
    const completed = screen.getByRole('button', { name: /Completed/ });
    expect(completed).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
    await user.click(completed);
    expect(completed).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('keeps a task due today at 9 AM in Today at 3 PM', async () => {
    const fake = createFakeApi([makeTask({ title: 'Nine', dueAt: TODAY_9AM })]);
    await openMyTasks(fake);
    const today = await screen.findByRole('region', { name: 'Today' });
    expect(within(today).getByText('Nine')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Overdue' })).not.toHaveTextContent('Nine');
    // The time has passed, but the day has not: red time, not "Overdue"
    expect(within(today).getByText(/Today, 9:00 AM/)).toHaveClass('text-danger');
    expect(within(today).queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it('shows no time for an all-day task and a time for a timed one', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'All day', dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true }),
      makeTask({ title: 'Timed', dueAt: TODAY_5PM }),
    ]);
    await openMyTasks(fake);
    await screen.findByText('All day');
    const allDay = within(itemOf('All day'));
    expect(allDay.getByText('Today')).toBeInTheDocument();
    expect(allDay.queryByText(/AM|PM/)).not.toBeInTheDocument();
    expect(within(itemOf('Timed')).getByText('Today, 5:00 PM')).toBeInTheDocument();
  });

  it('shows the summary and keeps empty date sections as headings only', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Late', dueAt: YESTERDAY }),
      makeTask({ title: 'Plain' }),
    ]);
    await openMyTasks(fake);
    await screen.findByText('Late');
    expect(screen.getByText('2 open · 1 overdue')).toBeInTheDocument();
    const today = screen.getByRole('region', { name: 'Today' });
    expect(within(today).queryByRole('list')).not.toBeInTheDocument();
    expect(within(today).getByRole('button', { name: /Today/ })).toBeInTheDocument();
  });
});

describe('cards', () => {
  it('shows everything a card should: two-line title, first tag and +N, blocked, progress, repeat, flag, red date', async () => {
    const [work, home] = [makeTag({ name: 'work' }), makeTag({ name: 'home' })];
    const parent = makeTask({
      title: 'A really long task title that goes over more than one line of the card',
      tags: [work, home].map(({ id, name, color }) => ({ id, name, color })),
      blockedBy: [{ id: makeTask().id, title: 'Other task' }],
      recurrenceRule: 'FREQ=DAILY',
      priority: 1,
      dueAt: YESTERDAY,
    });
    const children = ['a', 'b', 'c'].map((name, i) =>
      makeTask({
        title: name,
        parentTaskId: parent.id,
        status: i < 2 ? 'done' : 'todo',
        completedAt: i < 2 ? YESTERDAY : null,
      }),
    );
    await openMyTasks(createFakeApi([parent, ...children], [work, home]));
    await screen.findByText(parent.title);
    const card = itemOf(parent.title);
    const inCard = within(card);

    expect(inCard.getByText(parent.title)).toHaveClass('line-clamp-2');
    expect(inCard.getAllByTestId('tag-chip')).toHaveLength(1);
    expect(inCard.getByText('work')).toBeInTheDocument();
    expect(inCard.getByText('+1')).toBeInTheDocument();
    expect(inCard.getByText('Blocked')).toBeInTheDocument();
    expect(inCard.getByRole('progressbar', { name: 'Subtasks done: 2 of 3' })).toHaveAttribute(
      'aria-valuenow',
      '67',
    );
    expect(inCard.getByText('2/3')).toBeInTheDocument();
    expect(inCard.getByRole('img', { name: 'Repeats' })).toBeInTheDocument();
    expect(inCard.getByRole('img', { name: 'Urgent priority' })).toBeInTheDocument();
    expect(inCard.getByText('Yesterday, 3:30 PM')).toHaveClass('text-danger');
    // Subtasks are not cards of their own
    expect(titles()).toEqual([parent.title]);
  });

  it('has no progress bar, blocked badge, or repeat icon when there is nothing to show', async () => {
    await openMyTasks(createFakeApi([makeTask({ title: 'Bare', priority: 4 })]));
    await screen.findByText('Bare');
    const card = within(itemOf('Bare'));
    expect(card.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(card.queryByText('Blocked')).not.toBeInTheDocument();
    expect(card.queryByRole('img')).not.toBeInTheDocument();
    expect(card.queryByTestId('tag-chip')).not.toBeInTheDocument();
  });

  it('lays cards out in an auto-fill grid with an 8 px gap, and lifts them on hover', async () => {
    await openMyTasks(createFakeApi([makeTask({ title: 'One' })]));
    await screen.findByText('One');
    const card = itemOf('One');
    const grid = card.parentElement;
    expect(grid).toHaveClass('grid', 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))]', 'gap-2');
    expect(card).toHaveClass('hover:-translate-y-0.5', 'glass', 'rounded-card');
    // Drag and drop arrives with the Board feature
    expect(card).not.toHaveAttribute('draggable');
    expect(screen.queryByRole('button', { name: /drag/i })).not.toBeInTheDocument();
  });

  it('fades completed cards and strikes their titles through', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Done one', status: 'done', completedAt: '2025-10-06T05:00:00.000Z' }),
    ]);
    const { user } = await openMyTasks(fake);
    await user.click(await screen.findByRole('button', { name: /Completed/ }));
    const card = itemOf('Done one');
    expect(card).toHaveClass('opacity-60');
    expect(within(card).getByText('Done one')).toHaveClass('line-through');
  });
});

describe('list view', () => {
  it('shows compact rows with the same details and a delete button', async () => {
    const tag = makeTag({ name: 'work' });
    const parent = makeTask({
      title: 'Row task',
      tags: [{ id: tag.id, name: tag.name, color: tag.color }],
      priority: 2,
      recurrenceRule: 'FREQ=WEEKLY',
      dueAt: TOMORROW,
      blockedBy: [{ id: makeTask().id, title: 'Other' }],
    });
    const child = makeTask({ title: 'kid', parentTaskId: parent.id });
    const { user } = await openMyTasks(createFakeApi([parent, child], [tag]));
    await user.click(await screen.findByRole('radio', { name: 'List' }));

    const row = itemOf('Row task');
    expect(row.parentElement).not.toHaveClass('grid');
    const inRow = within(row);
    expect(inRow.getByText('work')).toBeInTheDocument();
    expect(inRow.getByText('Blocked')).toBeInTheDocument();
    expect(inRow.getByText('0/1')).toBeInTheDocument();
    expect(inRow.getByRole('img', { name: 'Repeats' })).toBeInTheDocument();
    expect(inRow.getByRole('img', { name: 'High priority' })).toBeInTheDocument();
    expect(inRow.getByText('Tomorrow, 3:30 PM')).toBeInTheDocument();
    expect(inRow.getByRole('button', { name: 'Delete: Row task' })).toHaveClass(
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
    );
  });

  it('has the same sections as Cards', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Late', dueAt: YESTERDAY }),
      makeTask({ title: 'Someday' }),
    ]);
    const { user } = await openMyTasks(fake);
    await user.click(await screen.findByRole('radio', { name: 'List' }));
    expect(
      within(screen.getByRole('region', { name: 'Overdue' })).getByText('Late'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'No date' })).toHaveTextContent('Someday');
  });
});

describe('the view choice', () => {
  it('defaults to Cards, saves a change on this device, and restores it', async () => {
    const fake = createFakeApi([makeTask({ title: 'One' })]);
    const { user } = await openMyTasks(fake);
    await screen.findByText('One');
    expect(screen.getByRole('radio', { name: 'Cards' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'List' }));
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    const raw = localStorage.getItem('personal-os.tasks-ui') ?? '{}';
    expect((JSON.parse(raw) as { state: { view: string } }).state.view).toBe('list');

    // A new start reads it back
    useTasksUi.setState({ view: 'cards' });
    localStorage.setItem('personal-os.tasks-ui', raw);
    await useTasksUi.persist.rehydrate();
    expect(useTasksUi.getState().view).toBe('list');
  });

  it('shows Board disabled with a Soon hint until the Board feature is on', async () => {
    await openMyTasks(createFakeApi([makeTask({ title: 'One' })]));
    await screen.findByText('One');
    const board = screen.getByRole('button', { name: /Board/ });
    expect(board).toBeDisabled();
    expect(board).toHaveTextContent('Soon');
  });

  it('falls back to Cards when a saved Board choice cannot open yet', async () => {
    useTasksUi.setState({ view: 'board' });
    await openMyTasks(createFakeApi([makeTask({ title: 'One' })]));
    await screen.findByText('One');
    expect(screen.getByRole('radio', { name: 'Cards' })).toBeChecked();
  });
});

describe('Filter, Sort, and Group', () => {
  const dueFor = (days: number) =>
    new Date(Date.parse(TODAY_5PM) + days * 86_400_000).toISOString();

  it('filters by status, priority, tag, due range, and archived, and keeps them in the URL', async () => {
    const tag = makeTag({ name: 'work' });
    const ref = { id: tag.id, name: tag.name, color: tag.color };
    const fake = createFakeApi(
      [
        makeTask({ title: 'Todo urgent', priority: 1, tags: [ref] }),
        makeTask({ title: 'Doing', status: 'doing', dueAt: dueFor(0) }),
        makeTask({ title: 'Week', dueAt: dueFor(3) }),
        makeTask({ title: 'Late', dueAt: YESTERDAY }),
        makeTask({ title: 'Old', archivedAt: '2025-10-01T00:00:00.000Z' }),
      ],
      [tag],
    );
    const { user, router } = await openMyTasks(fake);
    await screen.findByText('Doing');
    const search = () => router.state.location.search as Record<string, unknown>;
    expect(titles()).toHaveLength(4);

    await choose(user, 'Filter', 'In progress', 'menuitemcheckbox');
    await waitFor(() => {
      expect(search()).toEqual({ status: ['doing'] });
    });
    expect(titles()).toEqual(['Doing']);
    // The menu stays open to pick more; toggling again turns it off
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'In progress' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Urgent' }));
    await waitFor(() => {
      expect(search()).toEqual({ priority: [1] });
    });
    expect(titles()).toEqual(['Todo urgent']);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Urgent' }));

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'work' }));
    await waitFor(() => {
      expect(search()).toEqual({ tag: [tag.id] });
    });
    expect(titles()).toEqual(['Todo urgent']);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'work' }));

    for (const [label, key, expected] of [
      ['Overdue', 'overdue', ['Late']],
      ['Today', 'today', ['Doing']],
      ['This week', 'week', ['Doing', 'Week']],
      ['No date', 'none', ['Todo urgent']],
    ] as const) {
      await user.click(screen.getByRole('menuitemradio', { name: label }));
      await waitFor(() => {
        expect(search()).toEqual({ due: key });
      });
      expect(titles().sort()).toEqual([...expected].sort());
    }
    await user.click(screen.getByRole('menuitemradio', { name: 'Any' }));
    await waitFor(() => {
      expect(search()).toEqual({});
    });

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Archived' }));
    await waitFor(() => {
      expect(search()).toEqual({ archived: true });
    });
    await waitFor(() => {
      expect(titles()).toEqual(['Old']);
    });
  });

  it('opens with the filters of the link and clears them with Clear filters', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Urgent one', priority: 1 }),
      makeTask({ title: 'Low one', priority: 4 }),
    ]);
    const { user, router } = await openMyTasks(fake, '/tasks/my-tasks?priority=1');
    await screen.findByText('Urgent one');
    expect(titles()).toEqual(['Urgent one']);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(titles()).toHaveLength(2);
    });
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('does not stack history entries when filters change', async () => {
    const { user, router } = await openMyTasks(createFakeApi([makeTask({ title: 'One' })]));
    await screen.findByText('One');
    const before = router.history.length;
    await choose(user, 'Filter', 'To do', 'menuitemcheckbox');
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Done' }));
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ status: ['todo', 'done'] });
    });
    expect(router.history.length).toBe(before);
  });

  it('sorts by every option', async () => {
    const fake = createFakeApi([
      makeTask({
        title: 'Charlie',
        priority: 4,
        dueAt: dueFor(2),
        position: 1,
        createdAt: '2025-10-01T00:00:00.000Z',
      }),
      makeTask({
        title: 'Bravo',
        priority: 2,
        position: 2,
        createdAt: '2025-10-02T00:00:00.000Z',
      }),
      makeTask({
        title: 'Alpha',
        priority: 1,
        dueAt: dueFor(1),
        position: 3,
        createdAt: '2025-10-03T00:00:00.000Z',
      }),
    ]);
    const { user } = await openMyTasks(fake);
    await screen.findByText('Alpha');
    await choose(user, 'Group', 'None');
    expect(titles()).toEqual(['Charlie', 'Bravo', 'Alpha']); // Manual (the default)

    const expected: [string, string[]][] = [
      ['Due date', ['Alpha', 'Charlie', 'Bravo']],
      ['Priority', ['Alpha', 'Bravo', 'Charlie']],
      ['Created', ['Charlie', 'Bravo', 'Alpha']],
      ['Title', ['Alpha', 'Bravo', 'Charlie']],
      ['Manual', ['Charlie', 'Bravo', 'Alpha']],
    ];
    for (const [label, order] of expected) {
      await choose(user, 'Sort', label);
      expect(titles()).toEqual(order);
      expect(useTasksUi.getState().sort).toBe(
        {
          'Due date': 'due',
          Priority: 'priority',
          Created: 'created',
          Title: 'title',
          Manual: 'manual',
        }[label],
      );
    }
  });

  it('groups by Due, None, Tag, and Priority', async () => {
    const tag = makeTag({ name: 'work' });
    const ref = { id: tag.id, name: tag.name, color: tag.color };
    const fake = createFakeApi(
      [
        makeTask({ title: 'Tagged', tags: [ref], priority: 1 }),
        makeTask({ title: 'Untagged', priority: 4 }),
      ],
      [tag],
    );
    const { user } = await openMyTasks(fake);
    await screen.findByText('Tagged');
    const headings = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings()).toEqual(['Overdue0', 'Today0', 'Upcoming0', 'No date2', 'Completed0']);

    await choose(user, 'Group', 'Tag');
    expect(headings()).toEqual(['work1', 'No tag1']);
    expect(within(screen.getByRole('region', { name: 'work' })).getByText('Tagged')).toBeVisible();

    await choose(user, 'Group', 'Priority');
    expect(headings()).toEqual(['Urgent1', 'Low1']);

    await choose(user, 'Group', 'None');
    expect(headings()).toEqual([]);
    expect(titles()).toHaveLength(2);

    await choose(user, 'Group', 'Due');
    expect(headings()).toHaveLength(5);
  });

  it('collapses other groups with the heading button', async () => {
    const { user } = await openMyTasks(
      createFakeApi([makeTask({ title: 'A', priority: 1 }), makeTask({ title: 'B', priority: 4 })]),
    );
    await screen.findByText('A');
    await choose(user, 'Group', 'Priority');
    const urgent = screen.getByRole('button', { name: /Urgent/ });
    await user.click(urgent);
    expect(urgent).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('applies sort and group from the link when the page opens', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'B task', priority: 4 }),
      makeTask({ title: 'A task', priority: 1 }),
    ]);
    const { user } = await openMyTasks(fake, '/tasks/my-tasks?group=priority&sort=title');
    await screen.findByText('A task');
    expect(useTasksUi.getState()).toMatchObject({ group: 'priority', sort: 'title' });
    expect(screen.getByRole('region', { name: 'Urgent' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(screen.getByRole('menuitemradio', { name: 'Title' })).toBeChecked();
  });

  it('closes a menu with Escape (focus returns to its button) and with a click outside', async () => {
    const { user } = await openMyTasks(createFakeApi([makeTask({ title: 'One' })]));
    await screen.findByText('One');
    const sort = screen.getByRole('button', { name: 'Sort' });
    await user.click(sort);
    expect(screen.getByRole('menu', { name: 'Sort' })).toBeInTheDocument();
    expect(sort).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(sort).toHaveFocus();

    await user.click(sort);
    await user.click(screen.getByRole('heading', { name: 'My tasks' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('works by keyboard alone: open, move with arrows, choose with Enter', async () => {
    const { user } = await openMyTasks(createFakeApi([makeTask({ title: 'One' })]));
    await screen.findByText('One');
    screen.getByRole('button', { name: 'Group' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitemradio', { name: 'Due' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(useTasksUi.getState().group).toBe('tag');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group' })).toHaveFocus();
  });
});

describe('Completed and the archive', () => {
  it('shows the last 7 days and pages older ones with Show more', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Recent', status: 'done', completedAt: '2025-10-06T05:00:00.000Z' }),
      makeTask({ title: 'Older 1', status: 'done', completedAt: '2025-09-20T05:00:00.000Z' }),
      makeTask({ title: 'Older 2', status: 'done', completedAt: '2025-09-10T05:00:00.000Z' }),
    ]);
    const { user } = await openMyTasks(fake);
    await user.click(await screen.findByRole('button', { name: /Completed/ }));
    expect(titles()).toEqual(['Recent']);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Recent', 'Older 1', 'Older 2']);
    });
    expect(
      fake.calls.some(
        (call) =>
          call.query?.completedBefore === '2025-10-06T05:00:00.000Z' &&
          call.query.status === 'done',
      ),
    ).toBe(true);

    // The next page is empty, so the button goes away
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    });
    expect(titles()).toHaveLength(3);
  });

  it('shows only archived tasks with the archived filter', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Live' }),
      makeTask({ title: 'Shelved', archivedAt: '2025-10-01T00:00:00.000Z' }),
    ]);
    await openMyTasks(fake, '/tasks/my-tasks?archived=true');
    await screen.findByText('Shelved');
    expect(titles()).toEqual(['Shelved']);
    expect(screen.getByText('1 archived')).toBeInTheDocument();
    expect(fake.calls.some((call) => call.query?.archived === true)).toBe(true);
  });

  it('says so when nothing is archived', async () => {
    await openMyTasks(
      createFakeApi([makeTask({ title: 'Live' })]),
      '/tasks/my-tasks?archived=true',
    );
    expect(await screen.findByText('No archived tasks.')).toBeInTheDocument();
  });
});

describe('complete, delete, and select', () => {
  it('completes with the checkbox, moves it to Completed, and offers Undo', async () => {
    const fake = createFakeApi([makeTask({ title: 'Write report' })]);
    const { user } = await openMyTasks(fake);
    await user.click(await screen.findByRole('checkbox', { name: 'Complete: Write report' }));
    await waitFor(() => {
      expect(titles()).toEqual([]);
    });
    expect(screen.getByRole('button', { name: /Completed/ })).toHaveTextContent('1');

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Task completed.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Write report']);
    });
  });

  it('reopens a completed task', async () => {
    const fake = createFakeApi([
      makeTask({ title: 'Old', status: 'done', completedAt: '2025-10-06T05:00:00.000Z' }),
    ]);
    const { user } = await openMyTasks(fake);
    await user.click(await screen.findByRole('button', { name: /Completed/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Reopen: Old' }));
    await waitFor(() => {
      expect(fake.tasks()[0]).toMatchObject({ status: 'todo', completedAt: null });
    });
    expect(
      within(await screen.findByRole('region', { name: 'No date' })).getByText('Old'),
    ).toBeInTheDocument();
  });

  it('deletes from a list row with Undo', async () => {
    const fake = createFakeApi([makeTask({ title: 'Delete me' }), makeTask({ title: 'Keep me' })]);
    const { user } = await openMyTasks(fake);
    await user.click(await screen.findByRole('radio', { name: 'List' }));
    await user.click(screen.getByRole('button', { name: 'Delete: Delete me' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Keep me']);
    });
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Task deleted.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(titles()).toHaveLength(2);
    });
  });

  it('opens the detail panel when a card is clicked, and closes it from the panel', async () => {
    const fake = createFakeApi([makeTask({ title: 'Plan trip' })]);
    const { user } = await openMyTasks(fake);
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    await user.click(await screen.findByText('Plan trip'));
    const detail = screen.getByTestId('detail');
    expect(detail).toHaveAttribute('data-task', fake.tasks()[0]?.id);
    expect(itemOf('Plan trip')).toHaveAttribute('data-selected', 'true');
    await user.click(within(detail).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    expect(itemOf('Plan trip')).not.toHaveAttribute('data-selected');
  });

  it('opens the detail panel when a list row is clicked', async () => {
    const { user } = await openMyTasks(createFakeApi([makeTask({ title: 'Row' })]));
    await user.click(await screen.findByRole('radio', { name: 'List' }));
    await user.click(screen.getByText('Row'));
    expect(screen.getByTestId('detail')).toBeInTheDocument();
  });

  it('opens the task named in the link', async () => {
    const task = makeTask({ title: 'Linked' });
    await openMyTasks(createFakeApi([task]), `/tasks/my-tasks?task=${task.id}`);
    expect(await screen.findByTestId('detail')).toHaveAttribute('data-task', task.id);
  });

  it('closes the detail panel when the open task is deleted', async () => {
    const { user } = await openMyTasks(createFakeApi([makeTask({ title: 'Open one' })]));
    await user.click(await screen.findByRole('radio', { name: 'List' }));
    await user.click(screen.getByText('Open one'));
    await user.click(screen.getByRole('button', { name: 'Delete: Open one' }));
    await waitFor(() => {
      expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    });
  });
});

describe('loading, empty, and error states', () => {
  it('shows Loading while the tasks come in', async () => {
    const fake = createFakeApi([makeTask({ title: 'Slow' })]);
    fake.slow(60);
    await openMyTasks(fake);
    expect(screen.getByText('Loading tasks…')).toBeInTheDocument();
    expect(await screen.findByText('Slow')).toBeInTheDocument();
    expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument();
  });

  it('shows an empty state with a hint, and no sections', async () => {
    await openMyTasks();
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
    expect(screen.getByText('Nothing left to do')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('says when filters hide everything', async () => {
    await openMyTasks(
      createFakeApi([makeTask({ title: 'Low', priority: 4 })]),
      '/tasks/my-tasks?priority=1',
    );
    expect(await screen.findByText('No tasks match these filters.')).toBeInTheDocument();
  });

  it('says "Database update needed" when the server reports pending migrations', async () => {
    const fake = createFakeApi([makeTask({ title: 'Waiting' })]);
    fake.failNext(503, 'schema_behind', 'Database update needed: run pnpm db:migrate');
    await openMyTasks(fake);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Database update needed: run pnpm db:migrate',
    );
  });

  it('shows an error with Try again', async () => {
    const fake = createFakeApi([makeTask({ title: 'Back again' })]);
    fake.failNext(0, 'network', 'Cannot reach the server. Check that it is running and try again.');
    const { user } = await openMyTasks(fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('quick add on this page', () => {
  it('is focused when the page opens, with the + box and placeholder', async () => {
    await openMyTasks();
    await screen.findByText(/No tasks yet/);
    expect(addBox()).toHaveFocus();
    expect(addBox()).toHaveAttribute('placeholder', 'Add a task…');
  });

  it('adds a task that appears in its section', async () => {
    const { user } = await openMyTasks();
    await screen.findByText(/No tasks yet/);
    await user.type(addBox(), 'Buy milk{Enter}');
    await waitFor(() => {
      expect(titles()).toEqual(['Buy milk']);
    });
    expect(screen.getByRole('region', { name: 'No date' })).toHaveTextContent('Buy milk');
  });
});

describe('light and dark', () => {
  it.each(['dark', 'light'] as const)(
    'works in %s mode without hard-coded colors',
    async (theme) => {
      useSettings.getState().update({ theme });
      const fake = createFakeApi([
        makeTask({ title: 'Themed', priority: 1, dueAt: YESTERDAY, recurrenceRule: 'FREQ=DAILY' }),
      ]);
      const { user } = await openMyTasks(fake);
      await screen.findByText('Themed');
      await user.click(screen.getByRole('button', { name: 'Filter' }));
      const html = document.documentElement.innerHTML;
      expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
      expect(html).not.toMatch(/rgba?\(/);
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(items()).toHaveLength(1);
    },
  );
});
