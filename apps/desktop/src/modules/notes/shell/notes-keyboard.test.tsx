import type * as TauriWindow from '@tauri-apps/api/window';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePalette } from '../../../store/palette-store';
import { createFakeApi, makeNote } from '../../../test/fake-api';
import {
  findToast,
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

// The mock editor has a text box (the title) and an editable body, like the real one
vi.mock('../editor/note-editor-pane', () => ({
  NoteEditorPane: ({ noteId }: { noteId: string }) => (
    <div>
      <input aria-label="Title" defaultValue={noteId} />
      <div contentEditable suppressContentEditableWarning aria-label="Body" role="textbox" />
    </div>
  ),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const three = () => [
  makeNote({ title: 'One', updatedAt: '2025-10-07T03:00:00.000Z' }),
  makeNote({ title: 'Two', updatedAt: '2025-10-07T02:00:00.000Z' }),
  makeNote({ title: 'Three', updatedAt: '2025-10-07T01:00:00.000Z' }),
];

async function open() {
  const opened = await openNotes(createFakeApi([], [], [], [], three()));
  await screen.findByText('One');
  return opened;
}

const focusRow = (title: string) => {
  act(() => {
    rowOf(title).focus();
  });
};

describe('Notes keys', () => {
  it('N makes a new note and opens it', async () => {
    const { user, fake } = await open();
    await user.keyboard('n');
    await waitFor(() => {
      expect(fake.notes().map((note) => note.title)).toContain('Untitled');
    });
    expect(await screen.findByRole('textbox', { name: 'Body' })).toBeInTheDocument();
  });

  it('Up and Down move between rows, and Down from the filter field enters the list', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('searchbox', { name: 'Filter notes' }));
    await user.keyboard('{ArrowDown}');
    expect(rowOf('One')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(rowOf('Two')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(rowOf('Three')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(rowOf('Two')).toHaveFocus();
  });

  it('only one row is a Tab stop, the one last focused', async () => {
    const { user } = await open();
    expect(rowOf('One')).toHaveAttribute('tabindex', '0');
    expect(rowOf('Two')).toHaveAttribute('tabindex', '-1');
    focusRow('Two');
    expect(rowOf('Two')).toHaveAttribute('tabindex', '0');
    expect(rowOf('One')).toHaveAttribute('tabindex', '-1');
    await user.tab();
    expect(rowOf('Two').parentElement?.querySelector('[data-menu-trigger]')).toHaveFocus();
  });

  it('Enter opens the focused note and puts the cursor in the body', async () => {
    const { user } = await open();
    focusRow('Two');
    await user.keyboard('{Enter}');
    const body = await screen.findByRole('textbox', { name: 'Body' });
    await waitFor(() => {
      expect(body).toHaveFocus();
    });
    expect(rowOf('Two')).toHaveAttribute('aria-current', 'true');
  });

  it('Escape in the editor moves focus back to the note row', async () => {
    const { user } = await open();
    focusRow('Two');
    await user.keyboard('{Enter}');
    const body = await screen.findByRole('textbox', { name: 'Body' });
    await waitFor(() => {
      expect(body).toHaveFocus();
    });
    await user.keyboard('{Escape}');
    expect(rowOf('Two')).toHaveFocus();
  });

  it('Escape in the editor leaves an open menu to close itself', async () => {
    const { user } = await open();
    focusRow('Two');
    await user.keyboard('{Enter}');
    await screen.findByRole('textbox', { name: 'Body' });
    await user.click(screen.getByRole('button', { name: 'Sort notes' }));
    const menu = screen.getByRole('menu', { name: 'Sort notes' });
    await user.keyboard('{Escape}');
    expect(menu).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort notes' })).toHaveFocus();
  });

  it('Delete moves the focused note to Trash and focuses the next row', async () => {
    const { user } = await open();
    focusRow('One');
    await user.keyboard('{Delete}');
    await findToast('Moved to Trash.');
    expect(rowTitles()).toEqual(['Two', 'Three']);
    expect(rowOf('Two')).toHaveFocus();
  });

  it('? opens the shortcut help and Escape closes it', async () => {
    const { user } = await open();
    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('New note')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
  });
});

describe('where the keys do nothing', () => {
  it('ignores N, ? and Delete while typing in the filter field', async () => {
    const { user, fake } = await open();
    focusRow('One');
    await user.click(screen.getByRole('searchbox', { name: 'Filter notes' }));
    await user.keyboard('n?{Delete}');
    expect(screen.getByRole('searchbox', { name: 'Filter notes' })).toHaveValue('n?');
    expect(fake.notes()).toHaveLength(3);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores N inside the editor text and the title field', async () => {
    const { user, fake } = await open();
    focusRow('One');
    await user.keyboard('{Enter}');
    const body = await screen.findByRole('textbox', { name: 'Body' });
    await waitFor(() => {
      expect(body).toHaveFocus();
    });
    await user.keyboard('n');
    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    await user.keyboard('n');
    expect(fake.notes()).toHaveLength(3);
  });

  it('ignores keys with Ctrl, Alt or Meta', async () => {
    const { user, fake } = await open();
    focusRow('One');
    await user.keyboard('{Control>}n{/Control}{Alt>}n{/Alt}{Meta>}n{/Meta}');
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(fake.notes()).toHaveLength(3);
    expect(rowTitles()).toEqual(['One', 'Two', 'Three']);
  });

  it('ignores keys while a menu is open', async () => {
    const { user, fake } = await open();
    await user.click(screen.getByRole('button', { name: 'Sort notes' }));
    screen.getByRole('menu', { name: 'Sort notes' });
    await user.keyboard('n');
    expect(fake.notes()).toHaveLength(3);
  });

  it('ignores keys while the command palette is open', async () => {
    const { user, fake } = await open();
    focusRow('One');
    act(() => {
      usePalette.setState({ open: true });
    });
    await user.keyboard('n{Delete}');
    expect(fake.notes()).toHaveLength(3);
    expect(fake.trashedNotes()).toHaveLength(0);
  });

  it('does not open a note on Enter from a button inside the row', async () => {
    const { user, router } = await open();
    const more = rowOf('One').parentElement?.querySelector<HTMLElement>('[data-menu-trigger]');
    more?.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Actions for One' })).toBeInTheDocument();
    expect(router.state.location.search).not.toHaveProperty('note');
  });
});

describe('keys in Trash', () => {
  it('Enter restores and Delete asks before deleting forever', async () => {
    const gone = makeNote({ title: 'Gone', deletedAt: '2025-10-06T00:00:00.000Z' });
    const other = makeNote({ title: 'Other', deletedAt: '2025-10-05T00:00:00.000Z' });
    const { user, fake } = await openNotes(
      createFakeApi([], [], [], [], [gone, other]),
      '/notes?folder=trash',
    );
    await screen.findByText('Gone');
    focusRow('Gone');
    await user.keyboard('{Enter}');
    await findToast('Note restored.');
    expect(fake.notes().map((note) => note.title)).toEqual(['Gone']);

    focusRow('Other');
    await user.keyboard('{Delete}');
    expect(screen.getByRole('alertdialog', { name: 'Delete forever?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(fake.trashedNotes()).toHaveLength(1);
  });
});
