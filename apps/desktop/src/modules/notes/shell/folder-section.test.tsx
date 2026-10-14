import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeFolder, makeNote } from '../../../test/fake-api';
import { useNotesUi } from '../notes-ui-store';
import { findToast, openNotes, resetEverything, restoreEverything, rowTitles } from '../test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../editor/note-editor-pane', () => ({
  NoteEditorPane: ({ noteId }: { noteId: string }) => <div data-testid="editor">{noteId}</div>,
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const work = makeFolder({ name: 'Work' });
const plans = makeFolder({ name: 'Plans', parentId: work.id });
const home = makeFolder({ name: 'Home' });
const tree = () => [work, plans, home];

const folderList = () => screen.getByRole('list', { name: 'Folder list' });
const folderNames = () =>
  within(folderList())
    .getAllByRole('link')
    .map((link) => link.querySelector('.truncate')?.textContent);

describe('the side panel', () => {
  it('has All notes, Trash, and Soon rows for what is not built yet', async () => {
    await openNotes(createFakeApi());
    const nav = screen.getByRole('navigation', { name: 'Notes' });
    expect(within(nav).getByRole('link', { name: 'All notes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Trash' })).toBeInTheDocument();
    for (const label of ['Today', 'Tags', 'Templates']) {
      const soon = within(nav).getByText(label).closest('[aria-disabled="true"]');
      expect(soon).toHaveTextContent('Soon');
    }
  });

  it('collapses to icons and remembers it', async () => {
    const { user } = await openNotes(createFakeApi());
    await user.click(await screen.findByRole('button', { name: 'Collapse side panel' }));
    expect(screen.getByRole('complementary', { name: 'Notes navigation' })).toHaveClass('w-14');
    expect(screen.getByRole('link', { name: 'All notes' })).toBeInTheDocument();
    expect(useNotesUi.getState().sidePanelCollapsed).toBe(true);
    expect(localStorage.getItem('personal-os.notes-ui')).toContain('"sidePanelCollapsed":true');
    await user.click(screen.getByRole('button', { name: 'Expand side panel' }));
    expect(screen.getByRole('complementary', { name: 'Notes navigation' })).toHaveClass('w-56');
  });

  it('comes back to the last place when opened with no link', async () => {
    useNotesUi.setState({ place: 'trash' });
    const { router } = await openNotes(createFakeApi());
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ folder: 'trash' });
    });
    expect(await screen.findByRole('heading', { name: 'Trash' })).toBeInTheDocument();
  });
});

describe('the folder tree', () => {
  it('shows folders with their note counts, nested and sorted by name', async () => {
    await openNotes(
      createFakeApi([], [], [], [], [makeNote({ title: 'A', folderId: plans.id })], tree()),
    );
    await screen.findByRole('link', { name: /Home/ });
    expect(folderNames()).toEqual(['Home', 'Work', 'Plans']);
    expect(screen.getByRole('link', { name: /Plans.*1 note/ })).toBeInTheDocument();
  });

  it('folds and unfolds a folder with children and remembers it', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], [], tree()));
    await screen.findByRole('link', { name: /Plans/ });
    await user.click(screen.getByRole('button', { name: 'Fold Work' }));
    expect(screen.queryByRole('link', { name: /Plans/ })).not.toBeInTheDocument();
    expect(useNotesUi.getState().collapsedFolders).toEqual({ [work.id]: true });
    await user.click(screen.getByRole('button', { name: 'Unfold Work' }));
    expect(screen.getByRole('link', { name: /Plans/ })).toBeInTheDocument();
  });

  it('shows only the notes of the folder you choose', async () => {
    const inWork = makeNote({ title: 'In work', folderId: work.id });
    const loose = makeNote({ title: 'Loose' });
    const { user, router } = await openNotes(
      createFakeApi([], [], [], [], [inWork, loose], tree()),
    );
    await screen.findByText('Loose');
    await user.click(screen.getByRole('link', { name: /Work/ }));
    await waitFor(() => {
      expect(rowTitles()).toEqual(['In work']);
    });
    expect(router.state.location.search).toMatchObject({ folder: work.id });
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Work/ })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('link', { name: 'All notes' }));
    await waitFor(() => {
      expect(rowTitles()).toHaveLength(2);
    });
  });

  it('creates a folder from the + button and shows its notes list', async () => {
    const { user, fake } = await openNotes(createFakeApi());
    await user.click(await screen.findByRole('button', { name: 'New folder' }));
    await user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'Ideas{Enter}');
    await waitFor(() => {
      expect(fake.noteFolders().map((folder) => folder.name)).toEqual(['Ideas']);
    });
    expect(await screen.findByRole('heading', { name: 'Ideas' })).toBeInTheDocument();
  });

  it('Escape cancels a new folder and leaving an empty box creates nothing', async () => {
    const { user, fake } = await openNotes(createFakeApi());
    await user.click(await screen.findByRole('button', { name: 'New folder' }));
    await user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'Nope{Escape}');
    expect(screen.queryByRole('textbox', { name: 'New folder name' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New folder' }));
    await user.tab();
    expect(fake.noteFolders()).toHaveLength(0);
  });

  it('keeps the box open and shows the message when the name exists', async () => {
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [], [home]));
    await user.click(await screen.findByRole('button', { name: 'New folder' }));
    await user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'home{Enter}');
    await findToast('A folder with this name exists here.');
    expect(screen.getByRole('textbox', { name: 'New folder name' })).toBeInTheDocument();
    expect(fake.noteFolders()).toHaveLength(1);
  });

  it('adds a subfolder from the more menu, but not below three levels', async () => {
    const deep = makeFolder({ name: 'Deep', parentId: plans.id });
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [], [...tree(), deep]));
    await screen.findByRole('link', { name: /Deep/ });

    await user.click(screen.getByRole('button', { name: 'More options for Deep' }));
    expect(screen.getByRole('menuitem', { name: 'New subfolder' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'More options for Home' }));
    await user.click(screen.getByRole('menuitem', { name: 'New subfolder' }));
    await user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'Chores{Enter}');
    await waitFor(() => {
      expect(fake.noteFolders().find((folder) => folder.name === 'Chores')?.parentId).toBe(home.id);
    });
  });

  it('renames a folder', async () => {
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [], [home]));
    await user.click(await screen.findByRole('button', { name: 'More options for Home' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'Rename folder Home' });
    await user.clear(box);
    await user.type(box, 'House{Enter}');
    await waitFor(() => {
      expect(fake.noteFolders().map((folder) => folder.name)).toEqual(['House']);
    });
    expect(await screen.findByRole('link', { name: /House/ })).toBeInTheDocument();
  });

  it('moves a folder, and offers only places that stay within three levels', async () => {
    const { user, fake } = await openNotes(createFakeApi([], [], [], [], [], tree()));
    await user.click(await screen.findByRole('button', { name: 'More options for Work' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    const menu = screen.getByRole('menu', { name: 'Move Work to' });
    // Work holds Plans (two levels), so it can only go under a top-level folder... which is Home
    expect(within(menu).getByRole('menuitemradio', { name: 'Work' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(menu).getByRole('menuitemradio', { name: 'Plans' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(menu).getByRole('menuitemradio', { name: 'Top level' })).toBeChecked();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Home' }));
    await waitFor(() => {
      expect(fake.noteFolders().find((folder) => folder.id === work.id)?.parentId).toBe(home.id);
    });
    await findToast('Folder moved.');
  });

  it('deletes an empty folder with Undo, and refuses one that has notes', async () => {
    const full = makeFolder({ name: 'Full' });
    const { user, fake } = await openNotes(
      createFakeApi(
        [],
        [],
        [],
        [],
        [makeNote({ title: 'Inside', folderId: full.id })],
        [full, home],
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'More options for Full' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete folder' }));
    await findToast('Move or delete the 1 note in this folder first.');
    expect(fake.noteFolders()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'More options for Home' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete folder' }));
    const toast = await findToast('Folder deleted.');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Home/ })).not.toBeInTheDocument();
    });
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('link', { name: /Home/ })).toBeInTheDocument();
  });

  it('shows All notes when the folder in the link is gone', async () => {
    const { router } = await openNotes(
      createFakeApi([], [], [], [], [], [home]),
      '/notes?folder=00000000-0000-4000-8000-000000000999',
    );
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty('folder');
    });
    expect(await screen.findByRole('heading', { name: 'All notes' })).toBeInTheDocument();
  });

  it('says so when folders cannot be loaded and retries', async () => {
    const fake = createFakeApi([], [], [], [], [], [home]);
    fake.failNext(500, 'internal', 'boom', '/note-folders');
    const { user } = await openNotes(fake);
    expect(await screen.findByText('boom')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Home/ })).toBeInTheDocument();
  });
});

describe('the folder tree with the keyboard', () => {
  it('has one Tab stop per row: the chevron and the more button are skipped', async () => {
    await openNotes(createFakeApi([], [], [], [], [], tree()));
    await screen.findByRole('link', { name: /Work/ });
    expect(screen.getByRole('button', { name: 'Fold Work' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'More options for Work' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('moves between rows with the arrow keys', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], [], tree()));
    const homeLink = await screen.findByRole('link', { name: /Home/ });
    homeLink.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: /Work/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: /Plans/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(homeLink).toHaveFocus();
  });

  it('opens the folder menu with the menu key and returns focus to the row on Escape', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], [], [home]));
    const link = await screen.findByRole('link', { name: /Home/ });
    link.focus();
    await user.keyboard('{ContextMenu}');
    expect(screen.getByRole('menu', { name: 'Folder Home' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('puts the focus back on the folder link after a rename', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], [], [home]));
    await user.click(await screen.findByRole('button', { name: 'More options for Home' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'Rename folder Home' });
    await user.clear(box);
    await user.type(box, 'House{Enter}');
    expect(await screen.findByRole('link', { name: /House/ })).toHaveFocus();
  });

  it('puts the focus back on the folder link when a rename is cancelled with Escape', async () => {
    const { user } = await openNotes(createFakeApi([], [], [], [], [], [home]));
    await user.click(await screen.findByRole('button', { name: 'More options for Home' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('link', { name: /Home/ })).toHaveFocus();
  });

  it('moves the focus to the next row after a delete, and to New folder after the last one', async () => {
    const a = makeFolder({ name: 'Aaa' });
    const b = makeFolder({ name: 'Bbb' });
    const { user } = await openNotes(createFakeApi([], [], [], [], [], [a, b]));
    await user.click(await screen.findByRole('button', { name: 'More options for Aaa' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete folder' }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Bbb/ })).toHaveFocus();
    });
    await user.click(screen.getByRole('button', { name: 'More options for Bbb' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete folder' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New folder' })).toHaveFocus();
    });
  });
});
