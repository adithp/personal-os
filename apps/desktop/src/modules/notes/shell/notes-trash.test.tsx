import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeFolder, makeNote } from '../../../test/fake-api';
import {
  callsTo,
  findToast,
  openNotes,
  resetEverything,
  restoreEverything,
  rowMore,
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

const trashed = (title: string, extra = {}) =>
  makeNote({ title, deletedAt: '2025-10-06T00:00:00.000Z', ...extra });

describe('moving a note to Trash', () => {
  it('removes it from the list at once and Undo brings it back', async () => {
    const keep = makeNote({ title: 'Keep', updatedAt: '2025-10-06T00:00:00.000Z' });
    const gone = makeNote({ title: 'Gone', updatedAt: '2025-10-05T00:00:00.000Z' });
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [keep, gone]));
    await screen.findByText('Gone');

    await user.click(rowMore('Gone'));
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));

    expect(rowTitles()).toEqual(['Keep']);
    const toast = await findToast('Moved to Trash.');
    expect(fake.trashedNotes().map((note) => note.title)).toEqual(['Gone']);

    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Keep', 'Gone']);
    });
    expect(fake.trashedNotes()).toHaveLength(0);
  });

  it('closes the editor when the open note goes to Trash', async () => {
    const note = makeNote({ title: 'Open one' });
    const { user, router } = await openNotes(
      createFakeApi([], [], [], [], [note]),
      `/notes?note=${note.id}`,
    );
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
    await user.click(rowMore('Open one'));
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    await waitFor(() => {
      expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    });
    expect(router.state.location.search).not.toHaveProperty('note');
  });

  it('shows the server message and puts the note back when the move fails', async () => {
    const note = makeNote({ title: 'Stays' });
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [note]));
    await screen.findByText('Stays');
    fake.failNext(500, 'internal', 'Trash is jammed', '/notes/');
    await user.click(rowMore('Stays'));
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    await findToast('Trash is jammed');
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Stays']);
    });
  });
});

describe('the Trash view', () => {
  it('lists trashed notes only, with Restore and Delete forever on each', async () => {
    await openNotes(
      createFakeApi([], [], [], [], [makeNote({ title: 'Live' }), trashed('Old news')]),
      '/notes?folder=trash',
    );
    await screen.findByText('Old news');
    expect(rowTitles()).toEqual(['Old news']);
    expect(screen.getByRole('heading', { name: 'Trash' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore: Old news' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete forever: Old news' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New note' })).not.toBeInTheDocument();
  });

  it('opens from the side panel', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], [trashed('Old news')]));
    await user.click(await screen.findByRole('link', { name: 'Trash' }));
    expect(await screen.findByRole('button', { name: 'Restore: Old news' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trash' })).toHaveAttribute('aria-current', 'page');
  });

  it('restores a note, with Undo, and a taken title gets (2)', async () => {
    const { user, fake } = await openNotes(
      createFakeApi([], [], [], [], [makeNote({ title: 'Plan' }), trashed('Plan')]),
      '/notes?folder=trash',
    );
    await user.click(await screen.findByRole('button', { name: 'Restore: Plan' }));
    const toast = await findToast('Note restored.');
    await waitFor(() => {
      expect(
        fake
          .notes()
          .map((note) => note.title)
          .sort(),
      ).toEqual(['Plan', 'Plan (2)']);
    });
    expect(screen.getByText('Trash is empty')).toBeInTheDocument();
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(fake.trashedNotes().map((note) => note.title)).toEqual(['Plan (2)']);
    });
  });

  it('asks before deleting forever and only then deletes', async () => {
    const { user, fake } = await openNotes(
      createFakeApi([], [], [], [], [trashed('Doomed'), trashed('Spared')]),
      '/notes?folder=trash',
    );
    await user.click(await screen.findByRole('button', { name: 'Delete forever: Doomed' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete forever?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(
      callsTo(fake, 'DELETE', '/notes/' + (fake.trashedNotes()[0]?.id ?? '') + '/forever'),
    ).toHaveLength(0);
    expect(fake.trashedNotes()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Delete forever: Doomed' }));
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => {
      expect(fake.trashedNotes().map((note) => note.title)).toEqual(['Spared']);
    });
    await findToast('Note deleted for good.');
  });

  it('empties the trash after a confirmation', async () => {
    const { user, fake } = await openNotes(
      createFakeApi([], [], [], [], [makeNote({ title: 'Live' }), trashed('A'), trashed('B')]),
      '/notes?folder=trash',
    );
    await user.click(await screen.findByRole('button', { name: 'Empty trash' }));
    expect(screen.getByText(/2 notes will be deleted for good/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Empty Trash' }));
    await waitFor(() => {
      expect(fake.trashedNotes()).toHaveLength(0);
    });
    expect(fake.notes().map((note) => note.title)).toEqual(['Live']);
    await findToast('Trash emptied.');
    expect(screen.getByText('Trash is empty')).toBeInTheDocument();
  });

  it('has no Empty trash button when the trash is empty', async () => {
    await openNotes(createFakeApi(), '/notes?folder=trash');
    expect(await screen.findByText('Trash is empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Empty trash' })).not.toBeInTheDocument();
  });
});

describe('pin and move', () => {
  it('pins a note, shows it first, and Undo unpins it', async () => {
    const a = makeNote({ title: 'A', updatedAt: '2025-10-06T00:00:00.000Z' });
    const b = makeNote({ title: 'B', updatedAt: '2025-10-05T00:00:00.000Z' });
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [a, b]));
    await screen.findByText('B');
    await user.click(rowMore('B'));
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => {
      expect(rowTitles()).toEqual(['B', 'A']);
    });
    const toast = await findToast('Note pinned.');
    expect(fake.notes().find((note) => note.title === 'B')?.pinned).toBe(true);
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(fake.notes().find((note) => note.title === 'B')?.pinned).toBe(false);
    });
  });

  it('moves a note to a folder from the Move to menu', async () => {
    const work = makeFolder({ name: 'Work' });
    const note = makeNote({ title: 'Plan' });
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [note], [work]));
    await screen.findByText('Plan');
    await user.click(rowMore('Plan'));
    await user.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    const menu = screen.getByRole('menu', { name: 'Move Plan to' });
    expect(within(menu).getByRole('menuitemradio', { name: 'No folder' })).toBeChecked();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Work' }));
    await waitFor(() => {
      expect(fake.notes()[0]?.folderId).toBe(work.id);
    });
    await findToast('Note moved.');
    expect(await screen.findByRole('link', { name: /Work.*1 note/ })).toBeInTheDocument();
  });
});
