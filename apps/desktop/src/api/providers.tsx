import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { ApiClient } from './api-client';
import { ApiContext } from './api-context';
import { createQueryClient } from './query-client';

export interface AppProvidersProps {
  api: ApiClient;
  /** Tests pass their own so cached data never leaks between tests. */
  queryClient?: QueryClient;
  children: ReactNode;
}

/** Server data (TanStack Query) and the backend client for the whole app. */
export function AppProviders({ api, queryClient, children }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}
