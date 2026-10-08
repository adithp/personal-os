import type { Task } from '@personal-os/shared';
import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../store/settings-store';
import { createFakeApi, makeTask } from '../../test/fake-api';
import { signedInAuth } from '../../test/fake-auth';
import { renderApp } from '../../test/render-app';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  // 12:00 in India on Tuesday 7 October 2025
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2025-10-07T06:30:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const at = {
  morning: '2025-10-07T04:00:00.000Z', // 9:30 AM India, today
  evening: '2025-10-07T11:30:00.000Z', // 5:00 PM India, today
  todayAllDay: '2025-10-06T18:30:00.000Z', // start of 7 October India
  yesterday: '2025-10-06T11:30:00.000Z',
  lastWeek: '2025-10-01T11:30:00.000Z',
  tomorrow: '2025-10-08T11:30:00.000Z',
};

async function openWith(tasks: Task[], prepare?: (fake: ReturnType<typeof createFakeApi>) => void) {
  const fake = createFakeApi(tasks);
  prepare?.(fake);
  const router = await renderApp('/', signedInAuth().auth, fake.api);
  return { router, user: userEvent.setup(), fake };
}

const tile = () => screen.getByRole('region', { name: "Today's tasks" });

/** A mixed day: done today, open today, overdue, tomorrow, no date, archived, subtask. */
function mixedDay(): Task[] {
  return [
    makeTask({ title: 'Done early', status: 'done', dueAt: at.morning, completedAt: at.morning }),
    makeTask({ title: 'Evening report', dueAt: at.evening }),
    makeTask({ title: 'Plan the day', dueAt: at.todayAllDay, dueAllDay: true }),
    makeTask({ title: 'Old bill', dueAt: at.yesterday }),
    makeTask({ title: 'Tomorrow thing', dueAt: at.tomorrow }),
    makeTask({ title: 'Someday' }),
    makeTask({ title: 'Archived today', dueAt: at.evening, archivedAt: at.morning }),
    makeTask({ title: 'A subtask', dueAt: at.evening, parentTaskId: crypto.randomUUID() }),
  ];
}

describe("Today's tasks tile with real tasks", () => {
  it('counts the done tasks of those due today, and ignores other days, archived, and subtasks', async () => {
    await openWith(mixedDay());
    await waitFor(() => {
      expect(within(tile()).getByText('of 3 done')).toBeInTheDocument();
    });
    expect(within(tile()).getByText('1')).toBeInTheDocument();
    expect(within(tile()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  });

  it('shows the overdue task first as Next, with Overdue as its due text', async () => {
    await openWith(mixedDay());
    expect(await within(tile()).findByText('Next: Old bill')).toBeInTheDocument();
    expect(within(tile()).getByText('Overdue')).toBeInTheDocument();
  });

  it('puts the oldest overdue task first', async () => {
    await openWith([
      makeTask({ title: 'Newer overdue', dueAt: at.yesterday }),
      makeTask({ title: 'Oldest overdue', dueAt: at.lastWeek }),
      makeTask({ title: 'Today one', dueAt: at.evening }),
    ]);
    expect(await within(tile()).findByText('Next: Oldest overdue')).toBeInTheDocument();
  });

  it('does not count overdue tasks in the number, and a done overdue task is ignored', async () => {
    await openWith([
      makeTask({ title: 'Old bill', dueAt: at.yesterday }),
      makeTask({ title: 'Paid', status: 'done', dueAt: at.lastWeek }),
      makeTask({ title: 'Today one', dueAt: at.evening }),
    ]);
    await waitFor(() => {
      expect(within(tile()).getByText('of 1 done')).toBeInTheDocument();
    });
    expect(within(tile()).getByText('0')).toBeInTheDocument();
    expect(within(tile()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it("picks today's tasks by due time, then by position, and shows the time", async () => {
    await openWith([
      makeTask({ title: 'Later', dueAt: at.evening, position: 1 }),
      makeTask({ title: 'Earlier', dueAt: at.morning, position: 5 }),
    ]);
    expect(await within(tile()).findByText('Next: Earlier')).toBeInTheDocument();
    expect(within(tile()).getByText('Due 9:30 AM')).toBeInTheDocument();
  });

  it('breaks a tie in due time by position', async () => {
    await openWith([
      makeTask({ title: 'Second', dueAt: at.evening, position: 20 }),
      makeTask({ title: 'First', dueAt: at.evening, position: 10 }),
    ]);
    expect(await within(tile()).findByText('Next: First')).toBeInTheDocument();
    expect(within(tile()).getByText('Due 5:00 PM')).toBeInTheDocument();
  });

  it('says All day for an all-day task', async () => {
    await openWith([makeTask({ title: 'Plan', dueAt: at.todayAllDay, dueAllDay: true })]);
    expect(await within(tile()).findByText('Next: Plan')).toBeInTheDocument();
    expect(within(tile()).getByText('All day')).toBeInTheDocument();
  });

  it('shows All done for today when every task due today is done', async () => {
    await openWith([
      makeTask({ title: 'One', status: 'done', dueAt: at.morning }),
      makeTask({ title: 'Two', status: 'done', dueAt: at.evening }),
    ]);
    expect(await within(tile()).findByText('All done for today')).toBeInTheDocument();
    expect(within(tile()).getByText('of 2 done')).toBeInTheDocument();
    expect(within(tile()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('shows Nothing due today with 0 of 0 when nothing is due or overdue', async () => {
    await openWith([makeTask({ title: 'Tomorrow thing', dueAt: at.tomorrow }), makeTask()]);
    expect(await within(tile()).findByText('Nothing due today')).toBeInTheDocument();
    expect(within(tile()).getByText('of 0 done')).toBeInTheDocument();
    expect(within(tile()).getByText('0')).toBeInTheDocument();
    expect(within(tile()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('uses the India day, not the UTC day, just after midnight in India', async () => {
    vi.setSystemTime(new Date('2025-10-07T18:40:00.000Z')); // 00:10 on 8 October in India
    await openWith([
      makeTask({ title: 'Was today', dueAt: at.evening }),
      makeTask({ title: 'Is today', dueAt: at.tomorrow }),
    ]);
    expect(await within(tile()).findByText('Next: Was today')).toBeInTheDocument();
    expect(within(tile()).getByText('Overdue')).toBeInTheDocument();
    expect(within(tile()).getByText('of 1 done')).toBeInTheDocument();
  });

  it('keeps the tile layout while loading, without numbers', async () => {
    await openWith(mixedDay(), (fake) => {
      fake.slow(60_000);
    });
    expect(tile()).toBeInTheDocument();
    expect(within(tile()).getByText('of – done')).toBeInTheDocument();
    expect(within(tile()).getAllByText('–')).toHaveLength(1);
    expect(within(tile()).queryByText(/^Next:/)).not.toBeInTheDocument();
    expect(within(tile()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('says Could not load tasks when the server fails', async () => {
    await openWith(mixedDay(), (fake) => {
      fake.failNext(500, 'server_error', 'Boom');
    });
    expect(await within(tile()).findByText('Could not load tasks')).toBeInTheDocument();
    expect(within(tile()).getByText('of – done')).toBeInTheDocument();
  });

  it('still opens Tasks from the tile button', async () => {
    const { router, user } = await openWith(mixedDay());
    await within(tile()).findByText('Next: Old bill');
    await user.click(within(tile()).getByRole('button', { name: 'Open Tasks' }));
    expect(router.state.location.pathname).toBe('/tasks');
  });
});
