import type { Note, NoteVersion, NoteVersionSummary, UndoDescriptor } from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { SEARCH_KEY } from '../../commands/search-queries';
import { useToasts } from '../../store/toast-store';
import { TAGS_KEY } from '../tasks/tags-queries';
import { noteKeys, NOTES_KEY } from './query-keys';

/**
 * Version history of a note (N4). The list carries no text; one version is read when it is opened.
 * A saved version never changes, so a loaded one is not read again.
 */

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/** The versions of a note, newest first. A hook with no id yet makes no request. */
export function useNoteVersions(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: noteKeys.versions(id ?? ''),
    queryFn: async () =>
      (await api.request<{ items: NoteVersionSummary[] }>('GET', `/notes/${id ?? ''}/versions`))
        .items,
    enabled: id !== null,
  });
}

/** One version with its title and text. No request until both ids are known. */
export function useNoteVersion(id: string | null, versionId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: noteKeys.version(id ?? '', versionId ?? ''),
    queryFn: async () =>
      (
        await api.request<{ item: NoteVersion }>(
          'GET',
          `/notes/${id ?? ''}/versions/${versionId ?? ''}`,
        )
      ).item,
    enabled: id !== null && versionId !== null,
    staleTime: Infinity,
  });
}

interface RestoreResult {
  item: Note;
  undo: UndoDescriptor | null;
}

/**
 * Puts a version's text back. The updated note replaces the cached copy, so an open editor loads
 * it quietly; an Undo toast posts the returned descriptor to `/undo` (it restores the text that
 * was saved just before).
 */
export function useRestoreVersion() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: NOTES_KEY }),
      client.invalidateQueries({ queryKey: TAGS_KEY }),
      client.invalidateQueries({ queryKey: SEARCH_KEY }),
    ]);

  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      api.request<RestoreResult>('POST', `/notes/${id}/restore/${versionId}`),
    onSuccess: async ({ item, undo }) => {
      client.setQueryData(noteKeys.detail(item.id), item);
      toast().show(
        'Version restored.',
        undo
          ? {
              action: {
                label: 'Undo',
                onClick: () => {
                  api
                    .request('POST', '/undo', { body: undo })
                    .then(refresh)
                    .catch((error: unknown) => {
                      toast().show(messageOf(error), { tone: 'error' });
                    });
                },
              },
            }
          : undefined,
      );
      await refresh();
    },
    onError: (error) => {
      toast().show(messageOf(error), { tone: 'error' });
    },
  });
}
