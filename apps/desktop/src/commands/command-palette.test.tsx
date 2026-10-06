import { MODULE_IDS, MODULES } from '@personal-os/shared';
import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modulePath } from '../shell/module-paths';
import { usePalette } from '../store/palette-store';
import { useSettings } from '../store/settings-store';
import { signedInAuth, signedOutAuth } from '../test/fake-auth';
import { renderApp } from '../test/render-app';
import { SHORTCUTS } from './shortcuts';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  usePalette.setState({ open: false });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

async function openApp(path = '/') {
  const fake = signedInAuth();
  const router = await renderApp(path, fake.auth);
  return { ...fake, router, user: userEvent.setup() };
}

const palette = () => screen.getByRole('dialog', { name: 'Command palette' });
const queryPalette = () => screen.queryByRole('dialog', { name: 'Command palette' });
const ctrl = (key: string) => `{Control>}${key}{/Control}`;

describe('opening and closing', () => {
  it('Ctrl K opens the palette with the cursor in the search field', async () => {
    const { user } = await openApp();
    expect(queryPalette()).not.toBeInTheDocument();

    await user.keyboard(ctrl('k'));
    expect(palette()).toBeInTheDocument();
    expect(within(palette()).getByPlaceholderText('Type a command…')).toHaveFocus();
  });

  it('Ctrl K again closes it', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    await user.keyboard(ctrl('k'));
    await waitFor(() => {
      expect(queryPalette()).not.toBeInTheDocument();
    });
  });

  it('Esc closes it', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(queryPalette()).not.toBeInTheDocument();
    });
  });

  it('the dashboard search bar opens it too', async () => {
    const { user } = await openApp('/');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(palette()).toBeInTheDocument();
  });

  it('opens from any screen, even while typing in a field', async () => {
    const { user } = await openApp('/');
    await user.type(screen.getByRole('textbox', { name: 'Ask or tell me what to do' }), 'hello');
    await user.keyboard(ctrl('k'));
    expect(palette()).toBeInTheDocument();
  });

  it('is not available on the login screen', async () => {
    const { auth } = signedOutAuth();
    await renderApp('/login', auth);
    const user = userEvent.setup();
    await user.keyboard(ctrl('k'));
    expect(queryPalette()).not.toBeInTheDocument();
  });

  it('starts empty each time it is opened', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    await user.type(within(palette()).getByPlaceholderText('Type a command…'), 'tasks');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(queryPalette()).not.toBeInTheDocument();
    });
    await user.keyboard(ctrl('k'));
    expect(within(palette()).getByPlaceholderText('Type a command…')).toHaveValue('');
  });
});

describe('what it lists', () => {
  it('has the three groups: Go to, Appearance, Dock', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    for (const group of ['Go to', 'Appearance', 'Dock']) {
      expect(within(palette()).getByText(group)).toBeInTheDocument();
    }
  });

  it('opens every module, in dock order', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    const goTo = within(palette())
      .getAllByRole('option')
      .map((option) => option.textContent)
      .filter((text) => text.startsWith('Open '));
    expect(goTo).toHaveLength(MODULE_IDS.length);
    MODULE_IDS.forEach((id, index) => {
      expect(goTo[index]).toContain(`Open ${MODULES[id].name}`);
    });
  });

  it('shows module colors on module commands and the shortcut hint', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    const tasks = within(palette()).getByRole('option', { name: /Open Tasks/ });
    expect(tasks.querySelector('[data-module="tasks"]')).toHaveStyle({
      backgroundColor: 'var(--module-tasks)',
    });
    expect(within(tasks).getByLabelText('Ctrl 2')).toBeInTheDocument();
    expect(
      within(within(palette()).getByRole('option', { name: /Open Settings/ })).getByLabelText(
        'Ctrl ,',
      ),
    ).toBeInTheDocument();
  });

  it('lists the three themes and the dock toggle', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    for (const name of [
      'Switch to dark theme',
      'Switch to light theme',
      'Follow system theme',
      'Toggle dock auto-hide',
    ]) {
      expect(within(palette()).getByRole('option', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it('has a hint line for the keys', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    expect(within(palette()).getByText(/Enter to run/)).toBeInTheDocument();
  });
});

describe('searching', () => {
  async function search(text: string) {
    const { user, ...rest } = await openApp();
    await user.keyboard(ctrl('k'));
    await user.type(within(palette()).getByPlaceholderText('Type a command…'), text);
    return { user, ...rest };
  }
  const visible = () =>
    within(palette())
      .queryAllByRole('option')
      .map((o) => o.textContent);

  it('filters by the title', async () => {
    await search('money');
    expect(visible()).toHaveLength(1);
    expect(visible()[0]).toContain('Open Money');
  });

  it('finds commands by related words', async () => {
    await search('night');
    expect(visible()[0]).toContain('Switch to dark theme');
  });

  it('finds the dock command', async () => {
    await search('auto-hide');
    expect(visible()[0]).toContain('Toggle dock auto-hide');
  });

  it('says so when nothing matches', async () => {
    await search('zzzzqqq');
    expect(visible()).toHaveLength(0);
    expect(within(palette()).getByText('No commands found.')).toBeInTheDocument();
  });

  it('is not case sensitive', async () => {
    await search('TASKS');
    expect(visible()[0]).toContain('Open Tasks');
  });
});

describe('running a command', () => {
  it('opens a module with the mouse and closes the palette', async () => {
    const { user, router } = await openApp('/');
    await user.keyboard(ctrl('k'));
    await user.click(within(palette()).getByRole('option', { name: /Open Habits/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/habits');
    });
    expect(queryPalette()).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Habits' })).toBeVisible();
  });

  it('runs the first match with Enter', async () => {
    const { user, router } = await openApp('/');
    await user.keyboard(ctrl('k'));
    await user.type(within(palette()).getByPlaceholderText('Type a command…'), 'settings{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings');
    });
    expect(queryPalette()).not.toBeInTheDocument();
  });

  it('moves with the arrow keys and runs with Enter', async () => {
    const { user, router } = await openApp('/');
    await user.keyboard(ctrl('k'));
    await user.keyboard('{ArrowDown}{Enter}'); // first item is Dashboard, so this is Tasks
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tasks');
    });
  });

  it.each([
    ['Switch to dark theme', 'dark'],
    ['Switch to light theme', 'light'],
    ['Follow system theme', 'system'],
  ] as const)('%s changes the theme right away', async (title, theme) => {
    useSettings.getState().update({ theme: theme === 'dark' ? 'light' : 'dark' });
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    await user.click(within(palette()).getByRole('option', { name: new RegExp(title) }));

    expect(useSettings.getState().theme).toBe(theme);
    expect(queryPalette()).not.toBeInTheDocument();
    if (theme !== 'system') expect(document.documentElement.dataset.theme).toBe(theme);
  });

  it('marks the current theme the next time it is opened', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    await user.click(within(palette()).getByRole('option', { name: /Switch to light theme/ }));

    await user.keyboard(ctrl('k'));
    const light = within(palette()).getByRole('option', { name: /Switch to light theme/ });
    expect(within(light).getByText('Current')).toBeInTheDocument();
    expect(
      within(within(palette()).getByRole('option', { name: /Switch to dark theme/ })).queryByText(
        'Current',
      ),
    ).not.toBeInTheDocument();
  });

  it('toggles dock auto-hide on and off, and shows the state', async () => {
    const { user } = await openApp();
    await user.keyboard(ctrl('k'));
    const before = within(palette()).getByRole('option', { name: /Toggle dock auto-hide/ });
    expect(within(before).getByText('Off')).toBeInTheDocument();
    await user.click(before);
    expect(useSettings.getState().dockAutoHide).toBe(true);

    await user.keyboard(ctrl('k'));
    const after = within(palette()).getByRole('option', { name: /Toggle dock auto-hide/ });
    expect(within(after).getByText('On')).toBeInTheDocument();
    await user.click(after);
    expect(useSettings.getState().dockAutoHide).toBe(false);
  });
});

describe('keyboard shortcuts', () => {
  it.each(MODULE_IDS)('the shortcut for %s opens it', async (id) => {
    const { user, router } = await openApp(id === 'dashboard' ? '/tasks' : '/');
    const key = SHORTCUTS.find((s) => s.action.type === 'module' && s.action.module === id)?.key;
    expect(key).toBeDefined();

    await user.keyboard(ctrl(key ?? ''));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(modulePath(id));
    });
  });

  it('Ctrl 1–9 and 0 follow the dock order, Ctrl J is the AI assistant, Ctrl , is Settings', async () => {
    const { user, router } = await openApp('/');
    const expected: [string, string][] = [
      ['2', '/tasks'],
      ['3', '/habits'],
      ['4', '/notes'],
      ['5', '/graph'],
      ['6', '/calendar'],
      ['7', '/mail'],
      ['8', '/drive'],
      ['9', '/projects'],
      ['0', '/money'],
      ['j', '/assistant'],
      [',', '/settings'],
      ['1', '/'],
    ];
    for (const [key, path] of expected) {
      await user.keyboard(ctrl(key));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe(path);
      });
    }
  });

  it('cancels the key so Windows does not also use it (Ctrl J downloads, Ctrl 0 zoom)', async () => {
    await openApp();
    for (const { key } of SHORTCUTS) {
      const notCancelled = fireEvent.keyDown(window, { key, ctrlKey: true });
      expect(notCancelled, `Ctrl ${key} should be cancelled`).toBe(false);
    }
  });

  it('leaves every other key alone, such as copy and paste', async () => {
    await openApp();
    for (const init of [
      { key: 'c', ctrlKey: true },
      { key: 'v', ctrlKey: true },
      { key: 'k', ctrlKey: true, shiftKey: true },
      { key: 'k', ctrlKey: true, altKey: true },
      { key: 'k' },
      { key: '2' },
      { key: 'j' },
    ]) {
      expect(fireEvent.keyDown(window, init), JSON.stringify(init)).toBe(true);
    }
  });

  it('works while typing in a text field', async () => {
    const { user, router } = await openApp('/');
    await user.type(screen.getByRole('textbox', { name: 'Ask or tell me what to do' }), 'abc');
    await user.keyboard(ctrl('2'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tasks');
    });
  });

  it('closes an open palette and then opens the page', async () => {
    const { user, router } = await openApp('/');
    await user.keyboard(ctrl('k'));
    await user.keyboard(ctrl('3'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/habits');
    });
    expect(queryPalette()).not.toBeInTheDocument();
  });

  it('ignores keys pressed while an input method is composing text', async () => {
    await openApp();
    const notCancelled = fireEvent.keyDown(window, { key: 'k', ctrlKey: true, isComposing: true });
    expect(notCancelled).toBe(true);
    expect(queryPalette()).not.toBeInTheDocument();
  });

  it('stops after logging out: no shortcuts on the login screen', async () => {
    const { auth } = await openApp().then((app) => ({ auth: app.auth }));
    await act(async () => {
      await auth.signOut();
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });
    expect(fireEvent.keyDown(window, { key: '2', ctrlKey: true })).toBe(true);
  });
});
