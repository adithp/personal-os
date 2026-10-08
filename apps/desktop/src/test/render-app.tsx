import { QueryClient } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { act, render } from '@testing-library/react';
import type { ApiClient } from '../api/api-client';
import { AppProviders } from '../api/providers';
import type { Auth } from '../auth/auth';
import { createAppRouter } from '../router';
import { createFakeApi } from './fake-api';

/** Renders the whole app (real routes) at a path with a given auth and backend. */
export async function renderApp(
  initialPath: string,
  auth: Auth,
  api: ApiClient = createFakeApi().api,
) {
  const router = createAppRouter({
    auth,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await act(async () => {
    await router.load();
  });
  // A fresh cache per render, and no waiting between retries
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <AppProviders api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}
