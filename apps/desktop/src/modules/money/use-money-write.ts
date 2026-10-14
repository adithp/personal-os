import type { MoneyWriteResult } from '@personal-os/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, type ApiClient } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { MONEY_KEY } from './query-keys';

export const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

export interface MoneyWriteSpec<I, T> {
  send: (api: ApiClient, input: I) => Promise<MoneyWriteResult<T>>;
  /** The toast after success (with an Undo button when the server gave an undo). */
  message?: string | ((input: I, item: T) => string);
}

/**
 * One Money write: calls the route, shows a toast with Undo (POST /undo), shows the server's
 * message when it refuses, and refreshes every Money query when it settles. Call `mutate(input,
 * { onSuccess })` to close a dialog only when the write worked.
 */
export function useMoneyWrite<I, T = unknown>(spec: MoneyWriteSpec<I, T>) {
  const api = useApi();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: MONEY_KEY });

  return useMutation({
    mutationFn: (input: I) => spec.send(api, input),
    onSuccess: ({ item, undo }, input) => {
      const text = typeof spec.message === 'function' ? spec.message(input, item) : spec.message;
      if (!text) return;
      const toast = useToasts.getState();
      if (!undo) {
        toast.show(text);
        return;
      }
      toast.show(text, {
        action: {
          label: 'Undo',
          onClick: () => {
            api
              .request('POST', '/undo', { body: undo })
              .then(refresh)
              .catch((error: unknown) => {
                useToasts.getState().show(messageOf(error), { tone: 'error' });
              });
          },
        },
      });
    },
    onError: (error) => {
      useToasts.getState().show(messageOf(error), { tone: 'error' });
    },
    onSettled: refresh,
  });
}
