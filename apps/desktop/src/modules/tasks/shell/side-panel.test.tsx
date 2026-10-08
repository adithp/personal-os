import type * as TauriWindow from '@tauri-apps/api/window';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi } from '../../../test/fake-api';
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

async function openTasks(path = '/tasks') {
  const router = await renderApp(path, signedInAuth().auth, createFakeApi().api);
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
      'Inbox' + 'Soon',
      'Reporting' + 'Soon',
      'Goals' + 'Soon',
      'Portfolios' + 'Soon',
    ]);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('links Overview and My tasks, and leaves the unbuilt items as disabled text, not links', async () => {
    await openTasks();
    const nav = within(panel());
    expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/tasks');
    expect(nav.getByRole('link', { name: 'My tasks' })).toHaveAttribute('href', '/tasks/my-tasks');
    for (const name of ['Inbox', 'Reporting', 'Goals', 'Portfolios']) {
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
