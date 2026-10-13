import type { TaskReport } from '@personal-os/shared';
import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { createFakeApi, makeReport } from '../../../test/fake-api';
import { NOW, openMyTasks, resetEverything, restoreEverything } from '../my-tasks/test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const TAG_ID = '11111111-1111-4111-8111-111111111111';

/** Week Mon 6 - Sun 12 Oct 2025, today Tue 7: Monday 3 done, Tuesday 5 done. */
function weekReport(overrides: Partial<TaskReport> = {}): TaskReport {
  const base = makeReport('week');
  return makeReport('week', {
    days: base.days.map((day, index) =>
      index === 0
        ? { ...day, done: 3, onTime: 2, late: 1, noDueDate: 0 }
        : index === 1
          ? { ...day, done: 5, onTime: 4, late: 0, noDueDate: 1 }
          : day,
    ),
    totals: { done: 8, onTime: 6, late: 1, noDueDate: 1, added: 4 },
    previous: {
      start: '2025-09-29',
      end: '2025-09-30',
      done: 5,
      onTime: 3,
      late: 1,
      noDueDate: 1,
      added: 6,
    },
    overdueNow: 2,
    byTag: [{ tagId: TAG_ID, name: 'work', color: '#93D3F5', done: 6 }],
    otherTagsDone: 1,
    noTagDone: 2,
    ...overrides,
  });
}

async function openReporting(report: TaskReport | null = weekReport()) {
  const fake = createFakeApi();
  if (report) fake.setReport(report);
  const opened = await openMyTasks(fake, '/tasks/reporting');
  return opened;
}

const tile = (name: string) => screen.getByRole('group', { name });
const card = (name: string) => screen.getByRole('region', { name });

describe('Reporting page header', () => {
  it('shows the title, the week range and the period switch', async () => {
    await openReporting();
    expect(await screen.findByRole('heading', { name: 'Reporting', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Mon 6 – Sun 12 Oct')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Report period' });
    expect(within(group).getByRole('radio', { name: 'This week' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'This month' })).not.toBeChecked();
  });

  it('switches to the month with a click and with the arrow keys', async () => {
    const { fake, user } = await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');
    fake.setReport(
      weekReport({
        period: 'month',
        start: '2025-10-01',
        end: '2025-10-31',
        days: makeReport('month').days,
      }),
    );
    await user.click(screen.getByRole('radio', { name: 'This month' }));
    expect(await screen.findByText('October 2025')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path === '/tasks/report' && c.query?.period === 'month')).toBe(
      true,
    );

    screen.getByRole('radio', { name: 'This month' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'This week' })).toBeChecked();
  });
});

describe('Reporting stat cards', () => {
  it('shows each number with its line', async () => {
    await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');

    const done = tile('Done');
    expect(within(done).getByText('8')).toBeInTheDocument();
    expect(within(done).getByText('Last week by Tue: 5')).toBeInTheDocument();

    const onTime = tile('On time');
    expect(within(onTime).getByText('86%')).toBeInTheDocument(); // 6 of 7
    expect(within(onTime).getByText('6 of 7 with a due date · last week 75%')).toBeInTheDocument();

    const overdue = tile('Overdue now');
    expect(within(overdue).getByText('2')).toBeInTheDocument();
    expect(within(overdue).getByText('Not done and past due')).toBeInTheDocument();

    const added = tile('Added');
    expect(within(added).getByText('4')).toBeInTheDocument();
    expect(within(added).getByText('Last week by Tue: 6')).toBeInTheDocument();
    expect(
      within(added).getByText('Includes the automatic next copy of a repeating task.'),
    ).toBeVisible();
  });

  it('rounds the on-time rate half up', async () => {
    await openReporting(
      weekReport({ totals: { done: 8, onTime: 1, late: 7, noDueDate: 0, added: 0 } }),
    );
    await screen.findByText('Mon 6 – Sun 12 Oct');
    expect(within(tile('On time')).getByText('13%')).toBeInTheDocument(); // 12.5
  });

  it('shows a dash when nothing had a due date', async () => {
    await openReporting(
      weekReport({ totals: { done: 8, onTime: 0, late: 0, noDueDate: 8, added: 0 } }),
    );
    await screen.findByText('Mon 6 – Sun 12 Oct');
    const onTime = tile('On time');
    expect(within(onTime).getByText('–')).toBeInTheDocument();
    expect(within(onTime).getByText('No due dates this week')).toBeInTheDocument();
  });
});

describe('Reporting charts', () => {
  it('names the chart with a one-sentence summary', async () => {
    await openReporting();
    expect(
      await screen.findByRole('group', {
        name: 'Done per day this week: 8 tasks, most on Tuesday (5).',
      }),
    ).toBeInTheDocument();
  });

  it('marks the table button as pressed, points it at the content, and keeps the table reachable', async () => {
    const { user } = await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');
    const perDay = card('Done per day');
    const button = within(perDay).getByRole('button', { name: 'Show table' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    const controlled = button.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    await user.click(button);
    const pressed = within(perDay).getByRole('button', { name: 'Show chart' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(pressed.getAttribute('aria-controls')).toBe(controlled);
    const scroller = within(perDay).getByRole('region', { name: 'Done per day table' });
    expect(scroller).toHaveAttribute('tabindex', '0');
    scroller.focus();
    expect(scroller).toHaveFocus();
  });

  it('swaps Done per day for a table and back', async () => {
    const { user } = await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');
    const perDay = card('Done per day');
    await user.click(within(perDay).getByRole('button', { name: 'Show table' }));

    const table = within(perDay).getByRole('table', { name: 'Done per day' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Day', 'Done', 'On time', 'Late']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(8);
    const monday = rows.at(1);
    if (!monday) throw new Error('No Monday row');
    expect(
      within(monday)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    ).toEqual(['Mon 6 Oct', '3', '2', '1']);

    await user.click(within(perDay).getByRole('button', { name: 'Show chart' }));
    expect(within(perDay).queryByRole('table')).not.toBeInTheDocument();
  });

  it('lists the tags, other tags and no tag with their counts', async () => {
    await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');
    const byTag = card('Done by tag');
    expect(within(byTag).getByText('A task counts once for each tag')).toBeInTheDocument();
    const items = within(byTag).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['work6', 'Other tags1', 'No tag2']);
  });

  it('skips Other tags and No tag when they are zero, and has a tag table', async () => {
    const { user } = await openReporting(weekReport({ otherTagsDone: 0, noTagDone: 0 }));
    await screen.findByText('Mon 6 – Sun 12 Oct');
    const byTag = card('Done by tag');
    expect(within(byTag).getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(byTag).getByRole('button', { name: 'Show table' }));
    const table = within(byTag).getByRole('table', { name: 'Done by tag' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Tag', 'Done']);
    expect(within(table).getByRole('cell', { name: 'work' })).toBeInTheDocument();
  });
});

describe('Reporting states', () => {
  it('shows placeholders at final size on the first load, with no spinner', async () => {
    const fake = createFakeApi();
    fake.setReport(weekReport());
    fake.slow(1500);
    await openMyTasks(fake, '/tasks/reporting');
    expect(await screen.findByRole('heading', { name: 'Reporting' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Done' })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Loading report…')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('group', { name: 'Done' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('keeps the previous picture at half opacity while the other period loads', async () => {
    const { fake, user } = await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');
    fake.setReport(
      weekReport({
        period: 'month',
        start: '2025-10-01',
        end: '2025-10-31',
        days: makeReport('month').days,
      }),
    );
    fake.slow(1500);
    await user.click(screen.getByRole('radio', { name: 'This month' }));
    const busy = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[aria-busy="true"]');
      if (!found) throw new Error('not busy');
      return found;
    });
    expect(busy).toHaveClass('opacity-50');
    expect(within(busy).getByRole('group', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByText('Mon 6 – Sun 12 Oct')).toBeInTheDocument();
    expect(await screen.findByText('October 2025', {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });
  });

  it('shows one card when nothing was ever finished, and its button opens My tasks', async () => {
    const { user, router } = await openReporting(makeReport('week', { hasEverDone: false }));
    expect(
      await screen.findByRole('heading', { name: 'No finished tasks yet' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Complete a few tasks and your week will show up here.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Done per day' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to My tasks' }));
    await waitFor(() => {
      expect(router.history.location.pathname).toBe('/tasks/my-tasks');
    });
  });

  it('shows the tiles and the empty period, not the card, when tasks were done before', async () => {
    await openReporting(
      makeReport('week', { overdueNow: 3, totals: { ...makeReport().totals, added: 2 } }),
    );
    expect(await screen.findByText('Nothing done this week yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'No finished tasks yet' }),
    ).not.toBeInTheDocument();
    expect(within(tile('Overdue now')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Added')).getByText('2')).toBeInTheDocument();
  });

  it('shows zeros and quiet lines when the period is empty but the last one was not', async () => {
    const { user } = await openReporting(
      makeReport('week', {
        previous: {
          start: '2025-09-29',
          end: '2025-09-30',
          done: 4,
          onTime: 2,
          late: 1,
          noDueDate: 1,
          added: 3,
        },
      }),
    );
    expect(await screen.findByText('Nothing done this week yet')).toBeInTheDocument();
    expect(within(tile('Done')).getByText('0')).toBeInTheDocument();
    expect(within(tile('On time')).getByText('–')).toBeInTheDocument();
    expect(screen.getByText('No tags yet this week')).toBeInTheDocument();
    // the table still lists the seven days
    await user.click(within(card('Done per day')).getByRole('button', { name: 'Show table' }));
    expect(within(card('Done per day')).getAllByRole('row')).toHaveLength(8);
  });

  it('shows the error card and loads again with Try again', async () => {
    const fake = createFakeApi();
    fake.setReport(weekReport());
    fake.failNext(500, 'internal', 'Boom', '/tasks/report');
    const { user } = await openMyTasks(fake, '/tasks/reporting');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Boom')).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('group', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the picture, undimmed, and offers Try again when a background refresh fails', async () => {
    const { fake, user } = await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');
    // the report is stale after a minute; coming back to the window refetches it
    vi.setSystemTime(new Date(Date.parse(NOW) + 5 * 60_000));
    fake.failNext(500, 'internal', 'Boom', '/tasks/report');
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    const line = await screen.findByText('Could not refresh.');
    expect(screen.getByRole('group', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('.opacity-50')).toBeNull();
    await user.click(within(line).getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.queryByText('Could not refresh.')).not.toBeInTheDocument();
    });
  });

  it('shows the server message when the database is behind', async () => {
    const fake = createFakeApi();
    fake.failNext(
      503,
      'schema_behind',
      'Database update needed: run pnpm db:migrate',
      '/tasks/report',
    );
    await openMyTasks(fake, '/tasks/reporting');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Database update needed/)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Reporting themes', () => {
  it.each(['dark', 'light'] as const)(
    'renders in %s mode with no hard-coded colors',
    async (theme) => {
      useSettings.getState().update({ theme });
      await openReporting();
      await screen.findByText('Mon 6 – Sun 12 Oct');
      expect(screen.getByRole('group', { name: 'Done' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Done per day' })).toBeInTheDocument();
      // tag colors from the data are the only literal colors, and they are not written as hex
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    },
  );
});

describe('Reporting keyboard', () => {
  it('reaches the period switch and both table buttons with Tab', async () => {
    const { user } = await openReporting();
    await screen.findByText('Mon 6 – Sun 12 Oct');
    const toggles = [
      within(card('Done per day')).getByRole('button', { name: 'Show table' }),
      within(card('Done by tag')).getByRole('button', { name: 'Show table' }),
    ];
    toggles[0]?.focus();
    await user.keyboard('{Enter}');
    expect(within(card('Done per day')).getByRole('button', { name: 'Show chart' })).toHaveFocus();
    toggles[1]?.focus();
    await user.keyboard(' ');
    expect(within(card('Done by tag')).getByRole('button', { name: 'Show chart' })).toHaveFocus();
  });
});
