import type * as TauriWindow from '@tauri-apps/api/window';
import { act, screen, within } from '@testing-library/react';
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

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  useToasts.getState().clear();
  resetTasksUi();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openTasks(path = '/tasks', fake: FakeApi = createFakeApi()) {
  const router = await renderApp(path, signedInAuth().auth, fake.api);
  return { router, user: userEvent.setup() };
}

const saved = () =>
  (JSON.parse(localStorage.getItem('personal-os.tasks-ui') ?? '{}') as { state: unknown }).state;
const panel = () => screen.getByRole('complementary', { name: 'Tasks navigation' });

describe('the Tasks side panel', () => {
  it('lists the items in order, with the page next to it', async () => {
    await openTasks();
    const items = within(panel()).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Overview',
      'My tasks',
      'Inbox',
      'Reporting',
      'Goals' + 'Soon',
      'Portfolios' + 'Soon',
    ]);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('links the built items, and leaves the unbuilt ones as disabled text, not links', async () => {
    await openTasks();
    const nav = within(panel());
    expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/tasks');
    expect(nav.getByRole('link', { name: 'My tasks' })).toHaveAttribute('href', '/tasks/my-tasks');
    expect(nav.getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', '/tasks/inbox');
    expect(nav.getByRole('link', { name: 'Reporting' })).toHaveAttribute(
      'href',
      '/tasks/reporting',
    );
    for (const name of ['Goals', 'Portfolios']) {
      expect(nav.queryByRole('link', { name: new RegExp(name) })).not.toBeInTheDocument();
      const item = nav.getByText(name).closest('[aria-disabled]');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(within(item as HTMLElement).getByText('Soon')).toBeInTheDocument();
    }
  });

  it('highlights the current page on Overview and on My tasks', async () => {
    const { router, user } = await openTasks();
    const nav = within(panel());
    expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'My tasks' })).not.toHaveAttribute('aria-current');

    await user.click(nav.getByRole('link', { name: 'My tasks' }));
    expect(router.state.location.pathname).toBe('/tasks/my-tasks');
    expect(nav.getByRole('link', { name: 'My tasks' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('starts on My tasks highlighted when opened there', async () => {
    await openTasks('/tasks/my-tasks');
    expect(within(panel()).getByRole('link', { name: 'My tasks' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('collapses to icons, expands again, and keeps the choice on this device', async () => {
    const { user } = await openTasks();
    const toggle = screen.getByRole('button', { name: 'Collapse side panel' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand side panel' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(panel()).queryByText('Overview')).not.toBeInTheDocument();
    expect(within(panel()).queryByText('Soon')).not.toBeInTheDocument();
    // Still reachable and named
    expect(within(panel()).getByRole('link', { name: 'My tasks' })).toBeInTheDocument();
    expect(saved()).toMatchObject({
      sidePanelCollapsed: true,
    });

    // Hover shows the name
    await user.hover(within(panel()).getByRole('link', { name: 'My tasks' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('My tasks');

    await user.click(screen.getByRole('button', { name: 'Expand side panel' }));
    expect(within(panel()).getByText('Overview')).toBeInTheDocument();
    expect(saved()).toMatchObject({
      sidePanelCollapsed: false,
    });
  });

  it('restores a collapsed panel from the saved choice', async () => {
    localStorage.setItem(
      'personal-os.tasks-ui',
      JSON.stringify({ state: { sidePanelCollapsed: true }, version: 1 }),
    );
    await act(async () => {
      await useTasksUi.persist.rehydrate();
    });
    await openTasks();
    expect(screen.getByRole('button', { name: 'Expand side panel' })).toBeInTheDocument();
    expect(within(panel()).queryByText('Overview')).not.toBeInTheDocument();
  });

  it('is fully usable by keyboard', async () => {
    const { router, user } = await openTasks();
    const nav = within(panel());
    screen.getByRole('button', { name: 'Collapse side panel' }).focus();
    await user.tab();
    expect(nav.getByRole('link', { name: 'Overview' })).toHaveFocus();
    await user.tab();
    expect(nav.getByRole('link', { name: 'My tasks' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/tasks/my-tasks');

    screen.getByRole('button', { name: 'Collapse side panel' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Expand side panel' })).toBeInTheDocument();
  });

  it.each(['dark', 'light'] as const)('uses theme tokens only in %s mode', async (theme) => {
    useSettings.getState().update({ theme });
    await openTasks();
    expect(document.documentElement.dataset.theme).toBe(theme);
    for (const el of [panel(), ...panel().querySelectorAll<HTMLElement>('*')]) {
      expect(el.style.color).toBe('');
      expect(el.style.backgroundColor).toBe('');
    }
  });
});

describe('the Inbox count in the side panel', () => {
  const tag = makeTag({ name: 'work' });
  const withInbox = (inbox: number) =>
    createFakeApi(
      [
        ...Array.from({ length: inbox }, (_, i) => makeTask({ title: `Loose ${String(i)}` })),
        makeTask({ title: 'Dated', dueAt: '2025-10-08T00:00:00.000Z' }),
        makeTask({ title: 'Tagged', tags: [{ id: tag.id, name: tag.name, color: tag.color }] }),
        makeTask({ title: 'Finished', status: 'done' }),
      ],
      [tag],
    );
  const inboxLink = (name: string | RegExp) => within(panel()).findByRole('link', { name });

  it('counts only the tasks to sort, in muted text, with the count in the name', async () => {
    await openTasks('/tasks', withInbox(3));
    const link = await inboxLink('Inbox, 3 tasks to sort');
    expect(link).toHaveTextContent('Inbox3');
    expect(link).toHaveAttribute('href', '/tasks/inbox');
  });

  it('says "1 task" for one task', async () => {
    await openTasks('/tasks', withInbox(1));
    expect(await inboxLink('Inbox, 1 task to sort')).toBeInTheDocument();
  });

  it('shows no number when the inbox is empty', async () => {
    await openTasks('/tasks', withInbox(0));
    const link = await inboxLink('Inbox');
    await screen.findByText('Favorites');
    expect(link).toHaveTextContent(/^Inbox$/);
  });

  it('shows 99+ above 99 tasks', async () => {
    await openTasks('/tasks', withInbox(100));
    expect(await inboxLink('Inbox, 100 tasks to sort')).toHaveTextContent('Inbox99+');
  });

  it('shows no number while the tasks load, then the number', async () => {
    const fake = withInbox(2);
    fake.slow(150);
    await openTasks('/tasks', fake);
    expect(within(panel()).getByRole('link', { name: 'Inbox' })).toHaveTextContent(/^Inbox$/);
    expect(await inboxLink('Inbox, 2 tasks to sort')).toBeInTheDocument();
  });

  it('shows no number when the tasks cannot be loaded', async () => {
    const fake = withInbox(2);
    fake.failNext(500, 'boom', 'Server error', true);
    await openTasks('/tasks', fake);
    await vi.waitFor(() => {
      expect(fake.calls.length).toBeGreaterThan(0);
    });
    expect(within(panel()).getByRole('link', { name: 'Inbox' })).toHaveTextContent(/^Inbox$/);
  });

  it('collapsed: no number on the icon, the tooltip reads "Inbox (N)"', async () => {
    useTasksUi.getState().toggleSidePanel();
    const { user } = await openTasks('/tasks', withInbox(3));
    const link = await inboxLink('Inbox, 3 tasks to sort');
    expect(link).toHaveTextContent('');
    await user.hover(link);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Inbox (3)');
  });

  it('collapsed and empty: the tooltip reads just "Inbox"', async () => {
    useTasksUi.getState().toggleSidePanel();
    const { user } = await openTasks('/tasks', withInbox(0));
    await screen.findByRole('button', { name: 'Expand side panel' });
    await user.hover(await inboxLink('Inbox'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Inbox$/);
  });

  it('marks Inbox as the current page when opened there', async () => {
    await openTasks('/tasks/inbox', withInbox(2));
    expect(await inboxLink('Inbox, 2 tasks to sort')).toHaveAttribute('aria-current', 'page');
  });
});
