import { createContext, useContext } from 'react';
import type { ApiClient } from './api-client';

export const ApiContext = createContext<ApiClient | null>(null);

/** The backend client for the screens below. */
export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside AppProviders');
  return api;
}
