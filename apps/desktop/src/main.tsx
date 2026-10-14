import './styles.css';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApiFromEnv } from './api/api-client';
import { AppProviders } from './api/providers';
import { createQueryClient } from './api/query-client';
import { createClientsFromEnv } from './auth/supabase-client';
import { createAppRouter } from './router';

const { auth, realtime } = createClientsFromEnv(import.meta.env);
const api = createApiFromEnv(import.meta.env, auth);
const router = createAppRouter({ auth });
const queryClient = createQueryClient();
// Cached server data belongs to the account that loaded it
auth.store.subscribe((state, previous) => {
  if (state.status === 'signedOut' && previous.status === 'signedIn') queryClient.clear();
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <AppProviders
      api={api}
      queryClient={queryClient}
      realtime={realtime ? { source: realtime, auth } : undefined}
    >
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
