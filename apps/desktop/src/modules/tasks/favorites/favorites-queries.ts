import type {
  CreateFavoriteInput,
  Favorite,
  FavoriteWriteResult,
  MoveFavoriteInput,
  UndoDescriptor,
  UpdateFavoriteInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/api-client';
import { useApi } from '../../../api/api-context';
import { useToasts } from '../../../store/toast-store';
import { positionBetween } from '../drag/position';
import { FAVORITES_KEY, TAGS_KEY } from '../query-keys';

export { FAVORITES_KEY };

/** The user's favorites, in their order. */
export function useFavorites() {
  const api = useApi();
  return useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: async () => (await api.request<{ items: Favorite[] }>('GET', '/task-favorites')).items,
  });
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/**
 * Create, rename, recolor, reorder and remove favorites. Changes show at once and are rolled back
 * with a message if the server refuses. Removing offers an Undo toast. Creating a view that is
 * already a favorite says so (the server returns the existing one and no undo).
 */
export function useFavoriteActions() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;
  // Tags show how many favorites use them (favoriteCount), so they refresh too
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: FAVORITES_KEY }),
      client.invalidateQueries({ queryKey: TAGS_KEY }),
    ]);

  const runUndo = async (descriptor: UndoDescriptor) => {
    try {
      await api.request('POST', '/undo', { body: descriptor });
      await refresh();
    } catch (error) {
      toast().show(messageOf(error), { tone: 'error' });
    }
  };

  const fail = (error: unknown, previous?: Favorite[]) => {
    if (previous) client.setQueryData(FAVORITES_KEY, previous);
    toast().show(messageOf(error), { tone: 'error' });
  };

  const create = useMutation({
    mutationFn: (input: CreateFavoriteInput) =>
      api.request<FavoriteWriteResult>('POST', '/task-favorites', { body: input }),
    onSuccess: ({ undo }) => {
      if (!undo) toast().show('Already in favorites.');
    },
    onError: (error) => {
      fail(error);
    },
    onSettled: () => refresh(),
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateFavoriteInput) =>
      api.request<FavoriteWriteResult>('PATCH', `/task-favorites/${id}`, { body: patch }),
    onMutate: async ({ id, ...patch }) => {
      await client.cancelQueries({ queryKey: FAVORITES_KEY });
      const previous = client.getQueryData<Favorite[]>(FAVORITES_KEY);
      client.setQueryData<Favorite[]>(FAVORITES_KEY, (list) =>
        list?.map((favorite) => (favorite.id === id ? { ...favorite, ...patch } : favorite)),
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      fail(error, context?.previous);
    },
    onSettled: () => refresh(),
  });

  /** Put a favorite between two others (afterId above, beforeId below). */
  const move = useMutation({
    mutationFn: ({ id, ...body }: MoveFavoriteInput) =>
      api.request<FavoriteWriteResult>('POST', `/task-favorites/${id}/move`, { body }),
    onMutate: async ({ id, afterId, beforeId }) => {
      await client.cancelQueries({ queryKey: FAVORITES_KEY });
      const previous = client.getQueryData<Favorite[]>(FAVORITES_KEY);
      const position = positionBetween(
        previous?.find((favorite) => favorite.id === afterId)?.position,
        previous?.find((favorite) => favorite.id === beforeId)?.position,
      );
      client.setQueryData<Favorite[]>(FAVORITES_KEY, (list) =>
        list
          ?.map((favorite) => (favorite.id === id ? { ...favorite, position } : favorite))
          .sort((a, b) => a.position - b.position),
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      fail(error, context?.previous);
    },
    onSettled: () => refresh(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.request<FavoriteWriteResult>('DELETE', `/task-favorites/${id}`),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: FAVORITES_KEY });
      const previous = client.getQueryData<Favorite[]>(FAVORITES_KEY);
      client.setQueryData<Favorite[]>(FAVORITES_KEY, (list) =>
        list?.filter((favorite) => favorite.id !== id),
      );
      return { previous };
    },
    onSuccess: ({ undo }) => {
      if (!undo) return;
      toast().show('Favorite removed.', {
        action: {
          label: 'Undo',
          onClick: () => {
            void runUndo(undo);
          },
        },
      });
    },
    onError: (error, _id, context) => {
      fail(error, context?.previous);
    },
    onSettled: () => refresh(),
  });

  return { create, update, move, remove };
}
