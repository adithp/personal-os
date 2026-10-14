import { SEARCH_MIN_CHARS, SEARCH_QUERY_MAX, type SearchResult } from '@personal-os/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useApi } from '../api/api-context';

/** Every cached search starts with this key; data changes invalidate it. */
export const SEARCH_KEY = ['search'] as const;

export const SEARCH_DEBOUNCE_MS = 150;

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

/**
 * Searches tasks and tags on the server 150 ms after typing stops, from 2 characters (docs/design/
 * research/search.md D16). Old results stay while new ones load (`stale`); a request that was typed
 * over is aborted.
 */
export function useSearch(text: string) {
  const api = useApi();
  const typed = text.trim().slice(0, SEARCH_QUERY_MAX);
  const debounced = useDebounced(typed, SEARCH_DEBOUNCE_MS);
  const active = typed.length >= SEARCH_MIN_CHARS;
  const enabled = debounced.length >= SEARCH_MIN_CHARS;

  const query = useQuery({
    queryKey: [...SEARCH_KEY, debounced],
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ item: SearchResult }>('POST', '/search', {
          body: { q: debounced },
          signal,
        })
      ).item,
  });

  return {
    /** The last answer; undefined below 2 characters or before the first answer. */
    result: active ? query.data : undefined,
    error: active && enabled && query.isError ? query.error : null,
    /** An answer is expected (typing pause or request in flight). */
    waiting: active && (typed !== debounced || !enabled || query.isFetching),
    /** The shown results belong to older text. */
    stale: active && query.data !== undefined && (typed !== debounced || query.isPlaceholderData),
  };
}
