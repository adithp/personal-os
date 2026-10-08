import type { CreateTagInput, Tag, UndoDescriptor, UpdateTagInput } from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { TAGS_KEY, TASKS_KEY } from './tasks-queries';

export { TAGS_KEY };

interface TagWriteResult {
  item: Tag;
  undo: UndoDescriptor | null;
}

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
    ]);
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
    onSuccess: () => refresh(),
    onError: fail,
  });

  return { create, update };
}
