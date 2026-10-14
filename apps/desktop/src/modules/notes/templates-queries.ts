import type {
  CreateNoteTemplateInput,
  NoteTemplate,
  UndoDescriptor,
  UpdateNoteTemplateInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { NOTE_TEMPLATES_KEY } from './query-keys';

/**
 * Note templates (N3). A name that is taken (409 `template_name_taken`) is thrown to the caller
 * with no toast, so the name field can show it; other errors show a toast.
 */

interface WriteResult {
  item: NoteTemplate;
  undo: UndoDescriptor | null;
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

export const isNameTaken = (error: unknown) =>
  error instanceof ApiError && error.code === 'template_name_taken';

/** All live templates, by name. */
export function useNoteTemplates() {
  const api = useApi();
  return useQuery({
    queryKey: NOTE_TEMPLATES_KEY,
    queryFn: async () =>
      (await api.request<{ items: NoteTemplate[] }>('GET', '/note-templates')).items,
  });
}

/** Create, update, delete (with an Undo toast) and restore. */
export function useTemplateActions() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;
  const refresh = () => client.invalidateQueries({ queryKey: NOTE_TEMPLATES_KEY });
  const fail = (error: unknown) => {
    if (!isNameTaken(error)) toast().show(messageOf(error), { tone: 'error' });
  };

  const create = useMutation({
    mutationFn: async (input: CreateNoteTemplateInput) =>
      (await api.request<WriteResult>('POST', '/note-templates', { body: input })).item,
    onSuccess: () => refresh(),
    onError: fail,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...body }: UpdateNoteTemplateInput) =>
      (await api.request<WriteResult>('PATCH', `/note-templates/${id}`, { body })).item,
    onSuccess: () => refresh(),
    onError: fail,
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.request<WriteResult>('POST', `/note-templates/${id}/restore`),
    onSuccess: () => refresh(),
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.request<WriteResult>('DELETE', `/note-templates/${id}`),
    onSuccess: ({ item }) => {
      toast().show('Template deleted.', {
        action: {
          label: 'Undo',
          onClick: () => {
            restore.mutate(item.id);
          },
        },
      });
      return refresh();
    },
    onError: fail,
  });

  return { create, update, remove, restore };
}
