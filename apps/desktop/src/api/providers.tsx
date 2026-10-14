import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { RealtimeSync, type RealtimeSyncProps } from '../realtime/realtime-sync-component';
import type { ApiClient } from './api-client';
import { ApiContext } from './api-context';
import { createQueryClient } from './query-client';

export interface AppProvidersProps {
  api: ApiClient;
  /** Tests pass their own so cached data never leaks between tests. */
  queryClient?: QueryClient;
  /** Live updates run only when this is given (the app passes it; most tests do not). */
  realtime?: RealtimeSyncProps;
  children: ReactNode;
}

/** Server data (TanStack Query) and the backend client for the whole app. */
export function AppProviders({ api, queryClient, realtime, children }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={client}>
        {realtime && <RealtimeSync {...realtime} />}
        {children}
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}
