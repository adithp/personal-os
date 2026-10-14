import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiContext } from '../api/api-context';
import { createQueryClient } from '../api/query-client';
import { createFakeApi } from '../test/fake-api';
import { useSearch } from './search-queries';

describe('useSearch', () => {
  it('shows a server failure at once, without the app-wide retries', async () => {
    const fake = createFakeApi();
    fake.failNext(500, 'internal', 'boom', '/search');
    // The real app client retries 5xx twice with a delay; the search hook must opt out
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiContext.Provider value={fake.api}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ApiContext.Provider>
    );
    const { result } = renderHook(() => useSearch('pay'), { wrapper });
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(fake.calls.filter((call) => call.path === '/search')).toHaveLength(1);
  });
});
