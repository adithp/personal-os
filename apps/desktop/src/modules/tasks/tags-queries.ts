import type { CreateTagInput, Tag, UndoDescriptor, UpdateTagInput } from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create as createStore } from 'zustand';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { SEARCH_KEY } from '../../commands/search-queries';
import { useToasts } from '../../store/toast-store';
import { FAVORITES_KEY, TAGS_KEY, TASKS_KEY } from './query-keys';

export { TAGS_KEY };

interface TagWriteResult {
  item: Tag;
  undo: UndoDescriptor | null;
}

/**
 * The last delete or merge, for the line in the Manage tags dialog: the toast is outside the
 * dialog's focus trap, so a keyboard user needs an Undo inside it. The dialog clears it.
 */
interface TagNotice {
  id: number;
  message: string;
  undo: () => void;
}
export const useTagNotice = createStore<{
  notice: TagNotice | null;
  set: (notice: TagNotice | null) => void;
}>()((set) => ({
  notice: null,
  set: (notice) => {
    set({ notice });
  },
}));
let noticeId = 1;

/** All of the user's tags. */
export function useTags() {
  const api = useApi();
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: async () => (await api.request<{ items: Tag[] }>('GET', '/tags')).items,
  });
}

/**
 * Create a tag (a name that exists already, ignoring case, returns the existing tag) and rename or
 * recolor one. Tasks show their tags, so a change refreshes the tasks too.
 */
export function useTagActions() {
  const api = useApi();
  const client = useQueryClient();

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: TAGS_KEY }),
      client.invalidateQueries({ queryKey: TASKS_KEY }),
      client.invalidateQueries({ queryKey: FAVORITES_KEY }),
      client.invalidateQueries({ queryKey: SEARCH_KEY }),
    ]);
  };

  const offerUndo = (message: string, undo: UndoDescriptor | null) => {
    if (!undo) return;
    const run = () => {
      void api.request('POST', '/undo', { body: undo }).then(refresh).catch(fail);
    };
    useToasts.getState().show(message, { action: { label: 'Undo', onClick: run } });
    useTagNotice.getState().set({ id: noticeId++, message, undo: run });
  };
  const fail = (error: unknown) => {
    useToasts
      .getState()
      .show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.', {
        tone: 'error',
      });
  };

  const create = useMutation({
    mutationFn: (input: CreateTagInput) =>
      api.request<TagWriteResult>('POST', '/tags', { body: input }),
    onSuccess: () => refresh(),
    onError: fail,
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateTagInput) =>
      api.request<TagWriteResult>('PATCH', `/tags/${id}`, { body: patch }),
    onMutate: () => {
      useTagNotice.getState().set(null);
    },
    onSuccess: () => refresh(),
    onError: fail,
  });

  /** Delete a tag: removed from every task and favorite (the tasks stay). Offers Undo. */
  const remove = useMutation({
    mutationFn: (id: string) => api.request<TagWriteResult>('DELETE', `/tags/${id}`),
    onSuccess: ({ undo }) => {
      offerUndo('Tag deleted.', undo);
      return refresh();
    },
    onError: fail,
  });

  /** Merge `sourceId` into `targetId`: its tasks and favorites move, then it is deleted. Offers Undo. */
  const merge = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      api.request<TagWriteResult>('POST', `/tags/${sourceId}/merge`, { body: { targetId } }),
    onSuccess: ({ undo }) => {
      offerUndo('Tags merged.', undo);
      return refresh();
    },
    onError: fail,
  });

  return { create, update, remove, merge };
}
