import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiContext } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { createFakeApi, makeNote, type FakeApi } from '../../test/fake-api';
import { useNote, useNotes, useRenameNote, useUpdateNote } from './notes-queries';
import { noteKeys } from './query-keys';

beforeEach(() => {
  useToasts.getState().clear();
});

function setup(fake: FakeApi) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiContext.Provider value={fake.api}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
  return { client, wrapper };
}

describe('useNote and useNotes', () => {
  it('makes no request for a note without an id', () => {
    const fake = createFakeApi();
    renderHook(() => useNote(null), { wrapper: setup(fake).wrapper });
    expect(fake.calls).toHaveLength(0);
  });

  it('reads the list without text and one note with text and revision', async () => {
    const note = makeNote({ title: 'Read me', contentMd: 'Some words here' });
    const fake = createFakeApi([], [], [], [], [note]);
    const { wrapper } = setup(fake);
    const list = renderHook(() => useNotes(), { wrapper });
    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });
    expect(list.result.current.data?.[0]).toMatchObject({
      title: 'Read me',
      excerpt: 'Some words here',
    });
    expect(list.result.current.data?.[0]).not.toHaveProperty('contentMd');

    const one = renderHook(() => useNote(note.id), { wrapper });
    await waitFor(() => {
      expect(one.result.current.data).toMatchObject({ contentMd: 'Some words here', revision: 1 });
    });
  });
});

describe('useUpdateNote', () => {
  it('resolves to the saved note with its new revision and puts it in the cache', async () => {
    const note = makeNote({ title: 'Doc' });
    const fake = createFakeApi([], [], [], [], [note]);
    const { wrapper, client } = setup(fake);
    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    let saved: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      saved = await result.current.mutateAsync({
        id: note.id,
        baseRevision: 1,
        contentMd: 'Hello',
      });
    });
    expect(saved).toMatchObject({ revision: 2, contentMd: 'Hello' });
    expect(client.getQueryData(noteKeys.detail(note.id))).toMatchObject({ revision: 2 });
    expect(fake.notes()[0]?.contentMd).toBe('Hello');

    await act(async () => {
      saved = await result.current.mutateAsync({
        id: note.id,
        baseRevision: 2,
        contentMd: 'Hello!',
      });
    });
    expect(saved?.revision).toBe(3);
  });

  it('does not patch the cache before the server answers', async () => {
    const note = makeNote({ title: 'Doc', contentMd: 'old' });
    const fake = createFakeApi([], [], [], [], [note]);
    const { wrapper, client } = setup(fake);
    const detail = renderHook(() => useNote(note.id), { wrapper });
    await waitFor(() => {
      expect(detail.result.current.data?.contentMd).toBe('old');
    });
    fake.slow(40);
    const { result } = renderHook(() => useUpdateNote(), { wrapper });
    act(() => {
      result.current.mutate({ id: note.id, baseRevision: 1, contentMd: 'new' });
    });
    expect(client.getQueryData<{ contentMd: string }>(noteKeys.detail(note.id))?.contentMd).toBe(
      'old',
    );
    await waitFor(() => {
      expect(client.getQueryData<{ contentMd: string }>(noteKeys.detail(note.id))?.contentMd).toBe(
        'new',
      );
    });
  });

  it('rejects with note_conflict on an old revision, without a toast, and force overrides', async () => {
    const note = makeNote({ title: 'Doc', revision: 3 });
    const fake = createFakeApi([], [], [], [], [note]);
    const { result } = renderHook(() => useUpdateNote(), { wrapper: setup(fake).wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: note.id, baseRevision: 2, contentMd: 'mine' }),
      ).rejects.toMatchObject({ status: 409, code: 'note_conflict' });
    });
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(fake.notes()[0]?.contentMd).toBe('');

    await act(async () => {
      await result.current.mutateAsync({
        id: note.id,
        baseRevision: 2,
        contentMd: 'mine',
        force: true,
      });
    });
    expect(fake.notes()[0]).toMatchObject({ contentMd: 'mine', revision: 4 });
  });
});

describe('useRenameNote', () => {
  it('renames, returns the new revision, and offers Undo', async () => {
    const note = makeNote({ title: 'Before' });
    const fake = createFakeApi([], [], [], [], [note]);
    const { result } = renderHook(() => useRenameNote(), { wrapper: setup(fake).wrapper });
    let renamed: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      renamed = await result.current.mutateAsync({ id: note.id, title: 'After' });
    });
    expect(renamed?.item).toMatchObject({ title: 'After', revision: 2 });
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: 'Renamed.' });
    expect(useToasts.getState().toasts[0]?.action?.label).toBe('Undo');
  });

  it('says how many other notes had their links updated', async () => {
    const note = makeNote({ title: 'Before' });
    const one = makeNote({ title: 'One', contentMd: 'see [[before]]' });
    const two = makeNote({ title: 'Two', contentMd: '[[Before|x]] and [[Before#h]]' });
    const fake = createFakeApi([], [], [], [], [note, one, two]);
    const { result } = renderHook(() => useRenameNote(), { wrapper: setup(fake).wrapper });
    let renamed: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      renamed = await result.current.mutateAsync({ id: note.id, title: 'After' });
    });
    expect(renamed?.item.updatedNoteIds).toEqual([one.id, two.id]);
    expect(useToasts.getState().toasts[0]).toMatchObject({
      message: 'Renamed. Updated links in 2 notes.',
    });
  });

  it('refuses a title that exists (ignoring case) and leaves the message to the title field', async () => {
    const one = makeNote({ title: 'Plan' });
    const two = makeNote({ title: 'Other' });
    const fake = createFakeApi([], [], [], [], [one, two]);
    const { result } = renderHook(() => useRenameNote(), { wrapper: setup(fake).wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: two.id, title: 'PLAN' })).rejects.toMatchObject(
        {
          status: 409,
          code: 'note_title_taken',
        },
      );
    });
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('refuses titles with link characters, and shows other errors in a toast', async () => {
    const note = makeNote({ title: 'Doc' });
    const fake = createFakeApi([], [], [], [], [note]);
    const { result } = renderHook(() => useRenameNote(), { wrapper: setup(fake).wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: note.id, title: 'a [b]' }),
      ).rejects.toMatchObject({
        status: 400,
      });
    });
    expect(useToasts.getState().toasts[0]).toMatchObject({ tone: 'error' });
  });
});
