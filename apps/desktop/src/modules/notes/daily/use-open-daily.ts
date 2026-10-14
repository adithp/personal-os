import type { Note, OpenDailyInput, UndoDescriptor } from '@personal-os/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../api/api-client';
import { useApi } from '../../../api/api-context';
import { useToasts } from '../../../store/toast-store';
import { NOTE_FOLDERS_KEY, NOTES_KEY } from '../query-keys';
import { useNotesNav } from '../shell/use-notes-nav';

/**
 * Opens the daily note of an India day (default today): the server returns the existing note or
 * creates it, and the editor then shows it. `open` never rejects; a failure shows a toast.
 */
export function useOpenDaily() {
  const api = useApi();
  const client = useQueryClient();
  const nav = useNotesNav();

  const mutation = useMutation({
    mutationFn: async (date?: string) => {
      const body: OpenDailyInput = date ? { date } : {};
      const answer = await api.request<{ item: Note; undo: UndoDescriptor | null }>(
        'POST',
        '/notes/daily',
        { body },
      );
      return answer.item;
    },
    onSuccess: async (note) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: NOTES_KEY }),
        client.invalidateQueries({ queryKey: NOTE_FOLDERS_KEY }),
      ]);
      nav.openNote(note.id);
    },
    onError: (error) => {
      useToasts
        .getState()
        .show(error instanceof ApiError ? error.message : 'Could not open the daily note.', {
          tone: 'error',
        });
    },
  });

  return {
    open: async (date?: string): Promise<void> => {
      try {
        await mutation.mutateAsync(date);
      } catch {
        // onError showed the message
      }
    },
    isPending: mutation.isPending,
  };
}
