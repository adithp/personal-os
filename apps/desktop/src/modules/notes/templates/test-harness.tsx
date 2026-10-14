import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { AppProviders } from '../../../api/providers';
import { ToastHost } from '../../../shell/toast-host';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, type FakeApi } from '../../../test/fake-api';

/** Renders part of the Notes screen with a mock API (no router: tests mock `use-notes-nav`). */
export function renderWithApi(ui: ReactElement, fake: FakeApi = createFakeApi()) {
  useToasts.getState().clear();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <AppProviders api={fake.api} queryClient={queryClient}>
      {ui}
      <ToastHost />
    </AppProviders>,
  );
  return { fake, user: userEvent.setup() };
}
