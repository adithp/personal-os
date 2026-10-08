import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AppProviders } from '../../../api/providers';
import { useToasts } from '../../../store/toast-store';
import type { FakeApi } from '../../../test/fake-api';
import { TaskDetailPanel } from './task-detail-panel';

/** Renders just the detail panel on top of a fake backend. */
export function openPanel(fake: FakeApi, taskId: string) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  useToasts.getState().clear();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <AppProviders api={fake.api} queryClient={queryClient}>
      <TaskDetailPanel taskId={taskId} onClose={onClose} />
    </AppProviders>,
  );
  return { user, onClose, view, queryClient };
}

/** Opens the panel and waits until the task has loaded. */
export async function openLoaded(fake: FakeApi, taskId: string) {
  const opened = openPanel(fake, taskId);
  await screen.findByRole('textbox', { name: 'Title' });
  return opened;
}

/** The bodies of every PATCH /tasks/:id the fake backend received. */
export const patches = (fake: FakeApi) =>
  fake.calls.filter((call) => call.method === 'PATCH' && call.path.startsWith('/tasks/'));

export const lastPatch = (fake: FakeApi) => patches(fake).at(-1)?.body;

export const toastMessages = () => useToasts.getState().toasts.map((toast) => toast.message);
