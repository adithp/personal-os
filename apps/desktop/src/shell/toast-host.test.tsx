import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_WITH_ACTION_MS, useToasts } from '../store/toast-store';
import { ToastHost } from './toast-host';

beforeEach(() => {
  useToasts.getState().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastHost', () => {
  it('keeps one live region in the page even with no toasts', () => {
    const { container } = render(<ToastHost />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a message as a status and an error as an alert', () => {
    render(<ToastHost />);
    act(() => {
      useToasts.getState().show('Saved.');
      useToasts.getState().show('Could not save.', { tone: 'error' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.');
  });

  it('waits while the mouse is over a toast, then closes it after the full time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms) => {
        vi.advanceTimersByTime(ms);
      },
    });
    render(<ToastHost />);
    act(() => {
      useToasts.getState().show('Task deleted.', { action: { label: 'Undo', onClick: vi.fn() } });
    });
    await user.hover(screen.getByRole('status'));
    act(() => {
      vi.advanceTimersByTime(TOAST_WITH_ACTION_MS + 5000);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    await user.unhover(screen.getByRole('status'));
    act(() => {
      vi.advanceTimersByTime(TOAST_WITH_ACTION_MS + 100);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('waits while focus is inside a toast (a keyboard user reaching Undo)', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastHost />);
    act(() => {
      useToasts.getState().show('Task deleted.', { action: { label: 'Undo', onClick: vi.fn() } });
    });
    act(() => {
      screen.getByRole('button', { name: 'Undo' }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_WITH_ACTION_MS * 3);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
