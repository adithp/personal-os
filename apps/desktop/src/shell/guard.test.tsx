import { MODULE_IDS } from '@personal-os/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient, signedInAuth, signedOutAuth } from '../test/fake-auth';
import { renderApp } from '../test/render-app';
import { useSettings } from '../store/settings-store';
import { createAuth } from '../auth/auth';
import { modulePath } from './module-paths';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

describe('login guard', () => {
  it.each(MODULE_IDS)('sends a signed-out user from %s to the login screen', async (id) => {
    const { auth } = signedOutAuth();
    const router = await renderApp(modulePath(id), auth);
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Modules' })).not.toBeInTheDocument();
  });

  it('lets a signed-in user open every module', async () => {
    for (const id of MODULE_IDS) {
      const { auth } = signedInAuth();
      const router = await renderApp(modulePath(id), auth);
      expect(router.state.location.pathname).toBe(modulePath(id));
    }
  });

  it('waits for the saved session before deciding, so a restart does not flash the login', async () => {
    const fake = createFakeClient({ user: { email: 'me@example.com' } });
    let release: () => void = () => undefined;
    fake.mocks.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ data: { session: { user: { email: 'me@example.com' } } }, error: null });
          };
        }),
    );
    const auth = createAuth({ client: fake.client });

    const loading = renderApp('/tasks', auth);
    await Promise.resolve();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();

    release();
    const router = await loading;
    expect(router.state.location.pathname).toBe('/tasks');
    expect(screen.getByRole('navigation', { name: 'Modules' })).toBeInTheDocument();
  });

  it('returns to the login screen when the session ends while a screen is open', async () => {
    const { auth, emit } = signedInAuth();
    const router = await renderApp('/notes', auth);
    expect(screen.getByRole('navigation', { name: 'Modules' })).toBeInTheDocument();

    act(() => {
      emit('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(screen.queryByRole('navigation', { name: 'Modules' })).not.toBeInTheDocument();
  });

  it('returns to the login screen after auth.signOut()', async () => {
    const { auth } = signedInAuth();
    const router = await renderApp('/', auth);

    await act(async () => {
      await auth.signOut();
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  it('after signing in from a guarded screen, the dock appears', async () => {
    const { auth } = signedOutAuth();
    const router = await renderApp('/tasks', auth);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'pw{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    const dock = await screen.findByRole('navigation', { name: 'Modules' });
    expect(within(dock).getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
