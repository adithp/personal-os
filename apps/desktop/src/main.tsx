import './styles.css';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAuthFromEnv } from './auth/supabase-client';
import { createAppRouter } from './router';

const router = createAppRouter({ auth: createAuthFromEnv(import.meta.env) });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
