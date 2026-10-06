import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from './auth';
import { signedInAuth, signedOutAuth } from '../test/fake-auth';
import { renderApp } from '../test/render-app';
import { useSettings } from '../store/settings-store';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

async function openLogin() {
  const fake = signedOutAuth();
  const router = await renderApp('/login', fake.auth);
  return { ...fake, router, user: userEvent.setup() };
}

describe('login screen', () => {
  it('shows email, password, and a Sign in button in a glass card, with no sign-up', async () => {
    await openLogin();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('bg-accent');
    expect(screen.queryByText(/sign up|create account|register|forgot/i)).not.toBeInTheDocument();
  });

  it('has no dock, but keeps the title bar', async () => {
    await openLogin();
    expect(screen.queryByRole('navigation', { name: 'Modules' })).not.toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('Personal OS');
  });

  it('puts the cursor in the email field', async () => {
    await openLogin();
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('shows field messages and does not call Supabase when the form is empty', async () => {
    const { user, mocks } = await openLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInvalid();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects an invalid email address', async () => {
    const { user } = await openLogin();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
  });

  it('shows "Wrong email or password." and lets you try again', async () => {
    const { user, mocks } = await openLogin();
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 },
    });

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.getByLabelText('Password')).toHaveValue('wrong');
  });

  it('disables the button while signing in', async () => {
    const { user, mocks } = await openLogin();
    let finish: () => void = () => undefined;
    mocks.signInWithPassword.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve({
              data: { session: { user: { email: 'me@example.com' } }, user: null },
              error: null,
            });
          };
        }),
    );

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    finish();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Signing in…' })).not.toBeInTheDocument();
    });
  });

  it('signs in with Enter and opens the dashboard with the dock', async () => {
    const { user, router, mocks } = await openLogin();
    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'correct horse',
    });
    expect(await screen.findByRole('navigation', { name: 'Modules' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('shows a generic message when the network fails', async () => {
    const { user, mocks } = await openLogin();
    mocks.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in');
  });

  it('is skipped when already signed in', async () => {
    const { auth } = signedInAuth();
    const router = await renderApp('/login', auth);
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('missing Supabase settings', () => {
  it('shows which variables are wrong, without their values, instead of the form', async () => {
    const auth = createAuth({
      issues: ['VITE_SUPABASE_URL still has the example value from .env.example'],
    });
    await renderApp('/login', auth);

    const card = screen.getByRole('heading', { name: 'The app is not configured' }).closest('div');
    expect(card).not.toBeNull();
    expect(screen.getByText(/VITE_SUPABASE_URL still has the example value/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(
      within(document.body).queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('sends every other screen to the login screen', async () => {
    const auth = createAuth({ issues: ['VITE_SUPABASE_ANON_KEY is missing'] });
    const router = await renderApp('/tasks', auth);
    expect(router.state.location.pathname).toBe('/login');
  });
});
