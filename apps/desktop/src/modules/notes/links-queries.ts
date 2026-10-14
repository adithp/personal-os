import type { NoteLinks, NoteTitle } from '@personal-os/shared';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../api/api-context';
import { noteKeys } from './query-keys';

/** Titles change rarely and are only used for suggestions, so they may be 30 s old. */
const TITLES_STALE_MS = 30_000;

/** The id and title of every live note (for the `[[` menu and link checks). */
export function useNoteTitles() {
  const api = useApi();
  return useQuery({
    queryKey: noteKeys.titles,
    queryFn: async () => (await api.request<{ items: NoteTitle[] }>('GET', '/notes/titles')).items,
    staleTime: TITLES_STALE_MS,
  });
}

/** Backlinks (with context) and outgoing links of one note. A hook with no id makes no request. */
export function useNoteLinks(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: noteKeys.links(id ?? ''),
    queryFn: async () =>
      (await api.request<{ item: NoteLinks }>('GET', `/notes/${id ?? ''}/links`)).item,
    enabled: id !== null,
  });
}
