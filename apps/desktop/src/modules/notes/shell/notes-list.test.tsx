import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { createFakeApi, makeFolder, makeNote } from '../../../test/fake-api';
import { useNotesUi } from '../notes-ui-store';
import {
  callsTo,
  newNoteButton,
  openNotes,
  resetEverything,
  restoreEverything,
  rowOf,
  rowTitles,
} from '../test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../editor/note-editor-pane', () => ({
  NoteEditorPane: ({ noteId }: { noteId: string }) => <div data-testid="editor">{noteId}</div>,
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const sample = () => [
  makeNote({
    title: 'Alpha',
    contentMd: 'First line of alpha',
    updatedAt: '2025-10-07T08:00:00.000Z',
    createdAt: '2025-10-02T00:00:00.000Z',
  }),
  makeNote({
    title: 'Beta',
    contentMd: 'Second',
    updatedAt: '2025-10-06T08:00:00.000Z',
    createdAt: '2025-10-03T00:00:00.000Z',
  }),
  makeNote({
    title: 'Gamma',
    pinned: true,
    updatedAt: '2025-09-20T08:00:00.000Z',
    createdAt: '2025-10-01T00:00:00.000Z',
  }),
];

describe('the note list', () => {
  it('shows pinned notes first, then the rest by last edited, with date and excerpt', async () => {
    await openNotes(createFakeApi([], [], [], [], sample()));
    await screen.findByText('Alpha');
    expect(rowTitles()).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(within(rowOf('Alpha')).getByText(/1:30 PM · First line of alpha/)).toBeInTheDocument();
    expect(within(rowOf('Beta')).getByText(/Yesterday · Second/)).toBeInTheDocument();
    expect(within(rowOf('Gamma')).getByText('Pinned:')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All notes' })).toBeInTheDocument();
    expect(screen.getByText('3 notes')).toBeInTheDocument();
  });

  it('sorts by title or by created date from the sort menu and remembers the choice', async () => {
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], sample()));
    await screen.findByText('Alpha');

    await user.click(screen.getByRole('button', { name: 'Sort notes' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Created' }));
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Gamma', 'Beta', 'Alpha']);
    });
    expect(fake.calls.at(-1)?.query).toMatchObject({ sort: 'created' });
    expect(useNotesUi.getState().sort).toBe('created');
    expect(JSON.parse(localStorage.getItem('personal-os.notes-ui') ?? '{}')).toMatchObject({
      state: { sort: 'created' },
    });
  });

  it('filters the loaded notes by title as you type', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], sample()));
    await screen.findByText('Alpha');

    await user.type(screen.getByRole('searchbox', { name: 'Filter notes' }), 'ALP');
    expect(rowTitles()).toEqual(['Alpha']);
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Filter notes' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter notes' }), 'zzz');
    expect(screen.getByText('No matching notes')).toBeInTheDocument();
  });

  it('opens a note in the editor when its row is clicked, and keeps it in the link', async () => {
    const notes = sample();
    const { user, router } = await openNotes(createFakeApi([], [], [], [], notes));
    await screen.findByText('Alpha');
    await user.click(rowOf('Alpha'));
    expect(screen.getByTestId('editor')).toHaveTextContent(notes[0]?.id ?? '');
    expect(router.state.location.search).toMatchObject({ note: notes[0]?.id });
    expect(rowOf('Alpha')).toHaveAttribute('aria-current', 'true');
  });

  it('opens straight to the note in the link', async () => {
    const notes = sample();
    await openNotes(createFakeApi([], [], [], [], notes), `/notes?note=${notes[1]?.id ?? ''}`);
    expect(await screen.findByTestId('editor')).toHaveTextContent(notes[1]?.id ?? '');
  });

  it('shows a hint instead of an editor while no note is open', async () => {
    await openNotes(createFakeApi([], [], [], [], sample()));
    await screen.findByText('Alpha');
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.getByText('No note open')).toBeInTheDocument();
  });
});

describe('making a note', () => {
  it('creates an Untitled note with the New note button and opens it', async () => {
    const { user, fake, router } = await openNotes(createFakeApi());
    await screen.findByText('No notes yet');
    await user.click(newNoteButton());
    await waitFor(() => {
      expect(screen.getByTestId('editor')).toBeInTheDocument();
    });
    expect(fake.notes().map((note) => note.title)).toEqual(['Untitled']);
    expect(router.state.location.search).toMatchObject({ note: fake.notes()[0]?.id });
    await waitFor(() => {
      expect(rowOf('Untitled')).toHaveAttribute('aria-current', 'true');
    });

    await user.click(newNoteButton());
    await waitFor(() => {
      expect(fake.notes().map((note) => note.title)).toEqual(['Untitled', 'Untitled 2']);
    });
  });

  it('creates the note inside the folder being shown', async () => {
    const work = makeFolder({ name: 'Work' });
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [], [work]));
    await user.click(await screen.findByRole('link', { name: /Work/ }));
    await screen.findByRole('heading', { name: 'Work' });
    await user.click(newNoteButton());
    await waitFor(() => {
      expect(fake.notes()).toHaveLength(1);
    });
    expect(fake.notes()[0]?.folderId).toBe(work.id);
    expect(callsTo(fake, 'POST', '/notes')[0]?.body).toEqual({ folderId: work.id });
  });
});

describe('the list states', () => {
  it('says there are no notes yet and offers a New note button', async () => {
    await openNotes(createFakeApi());
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByText('0 notes')).toBeInTheDocument();
  });

  it('says a folder is empty', async () => {
    const work = makeFolder({ name: 'Work' });
    await openNotes(createFakeApi([], [], [], [], [], [work]), `/notes?folder=${work.id}`);
    expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
  });

  it('shows a loading line and then the notes', async () => {
    const fake = createFakeApi([], [], [], [], sample());
    fake.slow(30);
    await openNotes(fake);
    expect(screen.getByText('Loading notes…')).toBeInTheDocument();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });

  it('shows the server message with a Try again button when loading fails', async () => {
    const fake = createFakeApi([], [], [], [], sample());
    fake.failNext(500, 'internal', 'The notes are asleep', '/notes');
    const { user } = await openNotes(fake);
    expect(await screen.findByText('The notes are asleep')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });

  it('keeps the rows on screen while a new sort loads', async () => {
    const fake = createFakeApi([], [], [], [], sample());
    const { user } = await openNotes(fake);
    await screen.findByText('Alpha');
    fake.slow(200);
    await user.click(screen.getByRole('button', { name: 'Sort notes' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Title' }));
    expect(rowTitles()).toHaveLength(3);
    expect(screen.queryByText('Loading notes…')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Gamma', 'Alpha', 'Beta']);
    });
  });

  it('shows an error bar above the rows when a refresh fails, and keeps the rows', async () => {
    const { user, fake } = await openNotes(
      createFakeApi([], [], [], [], sample(), [makeFolder({ name: 'Ideas' })]),
    );
    await screen.findByText('Alpha');
    // Renaming a folder refreshes the list (still All notes); that refresh fails
    fake.failNext(500, 'internal', 'The list is tired', '/notes');
    await user.click(await screen.findByRole('button', { name: 'More options for Ideas' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Rename folder Ideas' }), '2{Enter}');
    expect(await screen.findByText('The list is tired')).toBeInTheDocument();
    expect(rowTitles()).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.queryByText('The list is tired')).not.toBeInTheDocument();
    });
  });

  it('shows the shortcuts help through the body, not inside the glass list panel', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], sample()));
    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toHaveFocus();
  });

  it.each(['dark', 'light'] as const)(
    'shows the list in %s mode with no hard-coded colors',
    async (theme) => {
      useSettings.getState().update({ theme });
      await openNotes(createFakeApi([], [], [], [], sample()));
      await screen.findByText('Alpha');
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
    },
  );
});
