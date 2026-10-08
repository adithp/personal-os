import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, makeTag, makeTask, type FakeApi } from '../../../test/fake-api';
import { signedInAuth } from '../../../test/fake-auth';
import { renderApp } from '../../../test/render-app';
import { resetTasksUi, useTasksUi } from '../tasks-ui-store';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

// Tuesday 7 October 2025, 11:30 in India
const NOW = new Date('2025-10-07T06:00:00Z');
const at = (days: number, hour = 6) =>
  new Date(Date.UTC(2025, 9, 7 + days, hour, 0, 0)).toISOString();

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  useToasts.getState().clear();
  resetTasksUi();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openOverview(fake: FakeApi = createFakeApi()) {
  const router = await renderApp('/tasks', signedInAuth().auth, fake.api);
  return { router, fake, user: userEvent.setup() };
}

const card = () => screen.getByRole('region', { name: 'Tasks due soon' });
const rowTitles = () =>
  within(card())
    .queryAllByRole('listitem')
    .map((li) => within(li).getByRole('button', { name: /^Open: / }).textContent);

describe('Overview', () => {
  it('shows the greeting, the date, and the open and overdue numbers', async () => {
    await openOverview(
      createFakeApi([
        makeTask({ title: 'Late', dueAt: at(-2) }),
        makeTask({ title: 'Today', dueAt: at(0, 10) }),
        makeTask({ title: 'Someday' }),
        makeTask({ title: 'Finished', status: 'done', completedAt: at(-1) }),
        makeTask({ title: 'Old', archivedAt: at(-1) }),
      ]),
    );
    expect(await screen.findByText('3 open · 1 overdue')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning');
    expect(screen.getByText('Tuesday, 7 October')).toBeInTheDocument();
  });

  it('lists due soon: overdue, then today, then upcoming, max 5, leaving out done, archived and no-date', async () => {
    await openOverview(
      createFakeApi([
        makeTask({ title: 'Next week', dueAt: at(6) }),
        makeTask({ title: 'Tomorrow', dueAt: at(1) }),
        makeTask({ title: 'Today late', dueAt: at(0, 12) }),
        makeTask({ title: 'Yesterday', dueAt: at(-1) }),
        makeTask({ title: 'Last week', dueAt: at(-6) }),
        makeTask({ title: 'Far away', dueAt: at(30) }),
        makeTask({ title: 'No date' }),
        makeTask({ title: 'Done one', status: 'done', dueAt: at(-3), completedAt: at(-3) }),
        makeTask({ title: 'Archived', dueAt: at(-3), archivedAt: at(-2) }),
      ]),
    );
    await screen.findByText('Last week');
    expect(rowTitles()).toEqual(['Last week', 'Yesterday', 'Today late', 'Tomorrow', 'Next week']);
    expect(screen.queryByText('Far away')).not.toBeInTheDocument();
  });

  it('shows up to two tag chips and the due label on a row', async () => {
    const [a, b, c] = [
      makeTag({ name: 'work' }),
      makeTag({ name: 'home' }),
      makeTag({ name: 'x' }),
    ];
    const tags = [a, b, c].map(({ id, name, color }) => ({ id, name, color }));
    await openOverview(createFakeApi([makeTask({ title: 'Tagged', dueAt: at(1), tags })]));
    const item = (await screen.findByText('Tagged')).closest('li') as HTMLElement;
    expect(within(item).getAllByTestId('tag-chip')).toHaveLength(2);
    expect(within(item).getByText('+1')).toBeInTheDocument();
    expect(within(item).getByText(/Tomorrow/)).toBeInTheDocument();
  });

  it('completes from a row and offers Undo', async () => {
    const { fake, user } = await openOverview(
      createFakeApi([makeTask({ title: 'Pay rent', dueAt: at(0, 10) })]),
    );
    await user.click(await screen.findByRole('checkbox', { name: 'Complete: Pay rent' }));
    expect(await screen.findByText('Task completed.')).toBeInTheDocument();
    expect(fake.calls.some((call) => call.path.endsWith('/complete'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(await screen.findByText('Nothing due soon')).toBeInTheDocument();
  });

  it('opens My tasks with the task selected when a row is clicked', async () => {
    const task = makeTask({ title: 'Call mum', dueAt: at(1) });
    const { router, user } = await openOverview(createFakeApi([task]));
    await user.click(await screen.findByRole('button', { name: 'Open: Call mum' }));
    expect(router.state.location.pathname).toBe('/tasks/my-tasks');
    expect(useTasksUi.getState().selectedTaskId).toBe(task.id);
  });

  it('has a link to all tasks', async () => {
    const { router, user } = await openOverview();
    await user.click(await screen.findByRole('link', { name: 'See all my tasks' }));
    expect(router.state.location.pathname).toBe('/tasks/my-tasks');
  });

  it('collapses and expands the card with its header button', async () => {
    const { user } = await openOverview(createFakeApi([makeTask({ title: 'A', dueAt: at(1) })]));
    await screen.findByText('A');
    const header = screen.getByRole('button', { name: 'Tasks due soon' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('A')).not.toBeVisible();
    header.focus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('A')).toBeVisible();
  });

  it('shows a loading message, then the empty state', async () => {
    const fake = createFakeApi();
    fake.slow(50);
    await openOverview(fake);
    expect(screen.getByText('Loading tasks…')).toBeInTheDocument();
    expect(await screen.findByText('Nothing due soon')).toBeInTheDocument();
    expect(screen.getByText('0 open · 0 overdue')).toBeInTheDocument();
  });

  it('shows an error with Try again that recovers', async () => {
    const fake = createFakeApi([makeTask({ title: 'Back again', dueAt: at(1) })]);
    fake.failNext(0, 'network', 'Cannot reach the server. Check that it is running and try again.');
    const { user } = await openOverview(fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is usable by keyboard: tab to the checkbox, press Space to complete', async () => {
    const { user } = await openOverview(
      createFakeApi([makeTask({ title: 'Keyboard task', dueAt: at(0, 10) })]),
    );
    const box = await screen.findByRole('checkbox', { name: 'Complete: Keyboard task' });
    screen.getByRole('button', { name: 'Tasks due soon' }).focus();
    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(await screen.findByText('Task completed.')).toBeInTheDocument();
  });

  it.each(['dark', 'light'] as const)('uses theme tokens only in %s mode', async (theme) => {
    useSettings.getState().update({ theme });
    await openOverview(createFakeApi([makeTask({ title: 'T', dueAt: at(1) })]));
    await screen.findByText('T');
    expect(document.documentElement.dataset.theme).toBe(theme);
    for (const el of card().querySelectorAll<HTMLElement>('*')) {
      expect(el.style.color).toBe('');
      expect(el.style.backgroundColor).toBe('');
    }
  });
});
