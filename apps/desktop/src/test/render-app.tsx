import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { act, render } from '@testing-library/react';
import type { Auth } from '../auth/auth';
import { createAppRouter } from '../router';

/** Renders the whole app (real routes) at a path with a given auth. */
export async function renderApp(initialPath: string, auth: Auth) {
  const router = createAppRouter({
    auth,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  return router;
}
