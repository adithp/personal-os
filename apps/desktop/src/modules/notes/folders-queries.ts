import type { NoteFolder, UndoDescriptor } from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { NOTE_FOLDERS_KEY, NOTES_KEY } from './query-keys';

interface FolderWriteResult {
  item: NoteFolder;
  undo: UndoDescriptor | null;
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/** All folders with the number of notes directly in each (the tree is built from the parent ids). */
export function useNoteFolders() {
  const api = useApi();
  return useQuery({
    queryKey: NOTE_FOLDERS_KEY,
    queryFn: async () => (await api.request<{ items: NoteFolder[] }>('GET', '/note-folders')).items,
  });
}

/**
 * Create, rename, move, delete and restore folders. Each write resolves to the folder the server
 * answered with. A refusal (a name that exists, too deep, not empty) shows the server's message in
 * a toast and also rejects, so the caller can keep its input open.
 */
export function useFolderActions() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: NOTE_FOLDERS_KEY }),
      // A note shows its folder; a deleted folder cannot hold notes
      client.invalidateQueries({ queryKey: NOTES_KEY }),
    ]);
  };
  const fail = (error: unknown) => {
    toast().show(messageOf(error), { tone: 'error' });
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
          api.request('POST', '/undo', { body: undo }).then(refresh).catch(fail);
        },
      },
    });
  };

  const create = useMutation({
    mutationFn: async (input: { name: string; parentId?: string | null }) =>
      (await api.request<FolderWriteResult>('POST', '/note-folders', { body: input })).item,
    onSuccess: () => refresh(),
    onError: fail,
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      (await api.request<FolderWriteResult>('PATCH', `/note-folders/${id}`, { body: { name } }))
        .item,
    onSuccess: () => refresh(),
    onError: fail,
  });

  /** Moves a folder into another folder (null: top level). */
  const move = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      api.request<FolderWriteResult>('PATCH', `/note-folders/${id}`, { body: { parentId } }),
    onSuccess: ({ undo }) => {
      offerUndo('Folder moved.', undo);
      return refresh();
    },
    onError: fail,
  });

  /** Deletes an empty folder. The server refuses while it holds notes or folders. */
  const remove = useMutation({
    mutationFn: (id: string) => api.request<FolderWriteResult>('DELETE', `/note-folders/${id}`),
    onSuccess: ({ undo }) => {
      offerUndo('Folder deleted.', undo);
      return refresh();
    },
    onError: fail,
  });

  const restore = useMutation({
    mutationFn: async (id: string) =>
      (await api.request<FolderWriteResult>('POST', `/note-folders/${id}/restore`)).item,
    onSuccess: () => refresh(),
    onError: fail,
  });

  return { create, rename, move, remove, restore };
}
