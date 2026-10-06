import { MODULE_IDS, MODULES } from '@personal-os/shared';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '../router';
import { useSettings } from '../store/settings-store';
import { modulePath } from './module-paths';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

async function renderApp(initialPath = '/') {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  return router;
}

function stubSystemTheme(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty('--glass-blur');
  stubSystemTheme(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('placeholder pages', () => {
  it.each(MODULE_IDS)('%s page shows its name, color and roadmap step', async (id) => {
    await renderApp(modulePath(id));
    const { name, roadmapStep } = MODULES[id];

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name })).toBeInTheDocument();
    expect(within(main).getByText(`Coming in step ${String(roadmapStep)}`)).toBeInTheDocument();
    expect(main.querySelector(`[data-module="${id}"]`)).toHaveStyle({
      backgroundColor: `var(--module-${id})`,
    });
  });

  it('matches the ROADMAP.md steps', () => {
    const expected: Record<string, number> = {
      tasks: 2,
      notes: 2,
      assistant: 3,
      calendar: 4,
      mail: 4,
      drive: 4,
      habits: 5,
      projects: 5,
      money: 6,
      graph: 7,
    };
    for (const [id, step] of Object.entries(expected)) {
      expect(MODULES[id as keyof typeof MODULES].roadmapStep).toBe(step);
    }
  });
});

describe('navigation with the dock', () => {
  it('opens a module page and moves the active dot', async () => {
    const router = await renderApp('/');
    const dock = screen.getByRole('navigation', { name: 'Modules' });
    expect(within(dock).getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(within(dock).getByRole('button', { name: 'Mail' }));

    expect(router.state.location.pathname).toBe('/mail');
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Mail' })).toBeVisible();
    expect(within(dock).getByRole('button', { name: 'Mail' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(dock).getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getAllByTestId('active-dot')).toHaveLength(1);
  });

  it('leaves 40 px at the top of the page for the title bar overlay', async () => {
    await renderApp('/tasks');
    expect(screen.getByRole('main')).toHaveClass('pt-10');
    expect(screen.getByRole('banner')).toHaveClass('fixed', 'h-10');
  });

  it('shows the app name in the title bar on every page', async () => {
    await renderApp('/settings');
    expect(within(screen.getByRole('banner')).getByText('Personal OS')).toBeInTheDocument();
  });
});

describe('theme and wallpaper', () => {
  it('applies the OS theme in System mode', async () => {
    stubSystemTheme(false);
    await renderApp();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it.each(['dark', 'light'] as const)('applies the %s theme from settings', async (theme) => {
    useSettings.getState().update({ theme });
    await renderApp();
    expect(document.documentElement.dataset.theme).toBe(theme);
  });

  it('switches theme live when the setting changes', async () => {
    await renderApp();
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => {
      useSettings.getState().update({ theme: 'light' });
    });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('shows the wallpaper by default and a solid color when off', async () => {
    await renderApp();
    expect(screen.getByTestId('wallpaper')).toHaveStyle({ background: 'var(--wallpaper-default)' });

    act(() => {
      useSettings.getState().update({ wallpaperEnabled: false });
    });
    expect(screen.getByTestId('wallpaper')).toHaveAttribute('data-enabled', 'false');
    expect(screen.getByTestId('wallpaper').style.background).toBe('');
  });

  it('applies the blur strength from settings', async () => {
    useSettings.getState().update({ blurPx: 12 });
    await renderApp();
    expect(document.documentElement.style.getPropertyValue('--glass-blur')).toBe('12px');
  });

  it('applies dock settings', async () => {
    useSettings.getState().update({ dockIconSize: 'large' });
    await renderApp();
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveStyle({ width: '44px' });
  });
});
