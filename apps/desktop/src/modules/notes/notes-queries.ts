import type {
  CreateNoteInput,
  ListNotesInput,
  Note,
  NoteSummary,
  UndoDescriptor,
  UpdateNoteInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, type RequestOptions } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { SEARCH_KEY } from '../../commands/search-queries';
import { useToasts } from '../../store/toast-store';
import { NOTE_FOLDERS_KEY, noteKeys, NOTES_KEY } from './query-keys';

/**
 * Server data for the Notes module. Every cached note list or note starts with NOTES_KEY, so one
 * invalidation refreshes them all. The write hooks resolve to the note the server answered with
 * (its `revision` is the one to send as `baseRevision` next). Content saves are never patched into
 * the cache before the server answers; pin, move, delete and restore are, and roll back on error.
 */

type Snapshot = [readonly unknown[], unknown][];

interface WriteResult {
  item: Note;
  undo: UndoDescriptor | null;
  /** Rename only: the notes whose links were rewritten. */
  updatedNoteIds?: string[];
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/** Query-string form of the list filters. */
function toQuery(filters: ListNotesInput): RequestOptions['query'] {
  const query: Record<string, string | boolean | number | undefined> = {};
  for (const [key, value] of Object.entries(filters)) {
    query[key] = value;
  }
  return query;
}

/** Notes of one place (all, a folder, 'none', or the trash). No text, only a short excerpt. */
export function useNotes(filters: ListNotesInput = {}, options: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn: async () =>
      (await api.request<{ items: NoteSummary[] }>('GET', '/notes', { query: toQuery(filters) }))
        .items,
    enabled: options.enabled ?? true,
  });
}

/** One note with its text and revision. A hook with no id yet makes no request. */
export function useNote(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: noteKeys.detail(id ?? ''),
    queryFn: async () => (await api.request<{ item: Note }>('GET', `/notes/${id ?? ''}`)).item,
    enabled: id !== null,
  });
}

/** Removes a note from every cached list; returns what to put back (only the lists that had it). */
function removeFromLists(client: QueryClient, id: string): Snapshot {
  return changeInLists(client, id, () => null);
}

function changeInLists(
  client: QueryClient,
  id: string,
  change: (note: NoteSummary) => NoteSummary | null,
): Snapshot {
  const snapshot: Snapshot = client
    .getQueriesData<NoteSummary[]>({ queryKey: noteKeys.lists })
    .filter(([, data]) => Array.isArray(data) && data.some((note) => note.id === id))
    .map(([key, data]) => [key, data]);
  client.setQueriesData<NoteSummary[]>({ queryKey: noteKeys.lists }, (data) =>
    Array.isArray(data)
      ? data.flatMap((note) => {
          if (note.id !== id) return [note];
          const next = change(note);
          return next ? [next] : [];
        })
      : data,
  );
  return snapshot;
}

/** The shared parts of every write: refresh, Undo toast, error toast. */
function useWriter() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: NOTES_KEY }),
      // Folders show how many notes they hold
      client.invalidateQueries({ queryKey: NOTE_FOLDERS_KEY }),
      client.invalidateQueries({ queryKey: SEARCH_KEY }),
    ]);
  };

  const offerUndo = (message: string, undo: UndoDescriptor | null) => {
    if (!undo) {
      toast().show(message);
      return;
    }
    toast().show(message, {
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
    });
  };

  const fail = (error: unknown, snapshot?: Snapshot) => {
    for (const [key, data] of snapshot ?? []) client.setQueryData(key, data);
    toast().show(messageOf(error), { tone: 'error' });
  };

  return { api, client, refresh, offerUndo, fail };
}

/** Creates a note ("Untitled" when no title is given). */
export function useCreateNote() {
  const { api, refresh, fail } = useWriter();
  return useMutation({
    mutationFn: async (input: CreateNoteInput = {}) =>
      (await api.request<WriteResult>('POST', '/notes', { body: input })).item,
    onSuccess: () => refresh(),
    onError: (error) => {
      fail(error);
    },
  });
}

/**
 * Saves text, folder or pin. Needs the revision you last saw; a 409 `note_conflict` is thrown to
 * the caller (the editor shows its conflict bar), with no toast. The saved note replaces the cached
 * copy, so the new revision is there at once.
 */
export function useUpdateNote() {
  const { api, client } = useWriter();
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateNoteInput) =>
      (await api.request<WriteResult>('PATCH', `/notes/${id}`, { body })).item,
    onSuccess: async (note) => {
      client.setQueryData(noteKeys.detail(note.id), note);
      await Promise.all([
        client.invalidateQueries({ queryKey: noteKeys.lists }),
        client.invalidateQueries({ queryKey: SEARCH_KEY }),
      ]);
    },
  });
}

/**
 * Renames a note. Titles are unique: 409 `note_title_taken` is thrown to the caller (the title
 * field shows "A note with this title exists.") with no toast; other errors show a toast.
 */
export function useRenameNote() {
  const { api, client, refresh, offerUndo, fail } = useWriter();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const result = await api.request<WriteResult>('POST', `/notes/${id}/rename`, {
        body: { title },
      });
      return { ...result, id };
    },
    onSuccess: async ({ item, undo, updatedNoteIds, id }) => {
      client.setQueryData(noteKeys.detail(id), item);
      const others = (updatedNoteIds ?? []).filter((other) => other !== id).length;
      offerUndo(
        others > 0
          ? `Renamed. Updated links in ${String(others)} ${others === 1 ? 'note' : 'notes'}.`
          : 'Renamed.',
        undo,
      );
      await refresh();
    },
    onError: (error) => {
      if (!(error instanceof ApiError && error.code === 'note_title_taken')) fail(error);
    },
  });
}

/** Moves a note to Trash. The note leaves the lists at once; an Undo toast brings it back. */
export function useDeleteNote() {
  const { api, client, refresh, offerUndo, fail } = useWriter();
  return useMutation({
    mutationFn: (id: string) => api.request<WriteResult>('DELETE', `/notes/${id}`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: NOTES_KEY });
      return { snapshot: removeFromLists(client, id) };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Moved to Trash.', undo);
    },
    onError: (error, _id, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });
}

/** Brings a note back from Trash. A title that is taken now gets " (2)" from the server. */
export function useRestoreNote() {
  const { api, client, refresh, offerUndo, fail } = useWriter();
  return useMutation({
    mutationFn: (id: string) => api.request<WriteResult>('POST', `/notes/${id}/restore`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: NOTES_KEY });
      return { snapshot: removeFromLists(client, id) };
    },
    onSuccess: ({ undo }) => {
      offerUndo('Note restored.', undo);
    },
    onError: (error, _id, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });
}

/** Deletes one trashed note for good. No Undo: the caller asks for a confirmation first. */
export function usePurgeNote() {
  const { api, client, refresh, fail } = useWriter();
  const toast = useToasts.getState;
  return useMutation({
    mutationFn: (id: string) => api.request<WriteResult>('DELETE', `/notes/${id}/forever`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: NOTES_KEY });
      return { snapshot: removeFromLists(client, id) };
    },
    onSuccess: () => {
      toast().show('Note deleted for good.');
    },
    onError: (error, _id, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });
}

/** Deletes every trashed note for good. No Undo: the caller asks for a confirmation first. */
export function useEmptyTrash() {
  const { api, refresh, fail } = useWriter();
  const toast = useToasts.getState;
  return useMutation({
    mutationFn: () => api.request('DELETE', '/notes/trash'),
    onSuccess: () => {
      toast().show('Trash emptied.');
    },
    onError: (error) => {
      fail(error);
    },
    onSettled: () => refresh(),
  });
}

/**
 * Pin or move send `baseRevision`, which only the full note has (the lists carry none), so the
 * current note is read first. Pin and move do not change the revision.
 */
async function currentRevision(api: ReturnType<typeof useApi>, id: string): Promise<number> {
  return (await api.request<{ item: Note }>('GET', `/notes/${id}`)).item.revision;
}

/** Pins or unpins a note (pinned notes sit first in the list). Offers Undo. */
export function usePinNote() {
  const { api, client, refresh, offerUndo, fail } = useWriter();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.request<WriteResult>('PATCH', `/notes/${id}`, {
        body: { baseRevision: await currentRevision(api, id), pinned },
      }),
    onMutate: async ({ id, pinned }) => {
      await client.cancelQueries({ queryKey: NOTES_KEY });
      return { snapshot: changeInLists(client, id, (note) => ({ ...note, pinned })) };
    },
    onSuccess: ({ undo }, { pinned }) => {
      offerUndo(pinned ? 'Note pinned.' : 'Note unpinned.', undo);
    },
    onError: (error, _input, context) => {
      fail(error, context?.snapshot);
    },
    onSettled: () => refresh(),
  });
}

/** Moves a note into a folder (null: no folder). Offers Undo. */
export function useMoveNote() {
  const { api, refresh, offerUndo, fail } = useWriter();
  return useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) =>
      api.request<WriteResult>('PATCH', `/notes/${id}`, {
        body: { baseRevision: await currentRevision(api, id), folderId },
      }),
    onSuccess: ({ undo }) => {
      offerUndo('Note moved.', undo);
    },
    onError: (error) => {
      fail(error);
    },
    onSettled: () => refresh(),
  });
}
