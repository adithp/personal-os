import './styles.css';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApiFromEnv } from './api/api-client';
import { AppProviders } from './api/providers';
import { createAuthFromEnv } from './auth/supabase-client';
import { createAppRouter } from './router';

const auth = createAuthFromEnv(import.meta.env);
const api = createApiFromEnv(import.meta.env, auth);
const router = createAppRouter({ auth });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <AppProviders api={api}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
