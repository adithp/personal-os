import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeNote, makeTag } from '../../../test/fake-api';
import { tagPlace, validateNotesSearch } from '../notes-search';
import {
  callsTo,
  newNoteButton,
  openNotes,
  resetEverything,
  restoreEverything,
  rowTitles,
} from '../test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../editor/note-editor-pane', () => ({
  NoteEditorPane: ({ noteId }: { noteId: string }) => <div data-testid="editor">{noteId}</div>,
}));

const openDaily = vi.fn(() => Promise.resolve());
vi.mock('../daily/use-open-daily', () => ({
  useOpenDaily: () => ({ open: openDaily, isPending: false }),
}));

beforeEach(() => {
  resetEverything();
  openDaily.mockClear();
});
afterEach(restoreEverything);

const work = makeTag({ name: 'work', color: '#F7D96B' });
const ideas = makeTag({ name: 'Ideas', color: '#A8E6CF' });
const unused = makeTag({ name: 'unused', color: '#B8C1EC' });

const sample = () => [
  makeNote({
    title: 'Plan',
    contentMd: 'Ship it #work and #ideas',
    updatedAt: '2025-10-07T03:00:00.000Z',
  }),
  makeNote({ title: 'Brain', contentMd: 'Maybe #Ideas', updatedAt: '2025-10-07T02:00:00.000Z' }),
  makeNote({ title: 'Plain', contentMd: 'No tags here', updatedAt: '2025-10-07T01:00:00.000Z' }),
];

async function open(path = '/notes') {
  const fake = createFakeApi([], [work, ideas, unused], [], [], sample());
  const opened = await openNotes(fake, path);
  await screen.findByText('Plan');
  return opened;
}

const tagList = () => screen.getByRole('list', { name: 'Tag list' });

describe('the Tags section of the side panel', () => {
  it('lists only tags that notes use, with their note counts', async () => {
    await open();
    const links = await within(await screen.findByRole('region', { name: 'Tags' })).findAllByRole(
      'link',
    );
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      '#Ideas, 2 notes',
      '#work, 1 note',
    ]);
  });

  it('filters the list by the chosen tag and asks the server with tagId', async () => {
    const { user, fake } = await open();
    await user.click(
      await within(await screen.findByRole('list', { name: 'Tag list' })).findByRole('link', {
        name: '#Ideas, 2 notes',
      }),
    );
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Plan', 'Brain']);
    });
    expect(screen.getByRole('heading', { name: '#Ideas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#Ideas, 2 notes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(callsTo(fake, 'GET', '/notes').some((call) => call.query?.tagId === ideas.id)).toBe(
      true,
    );
  });

  it('opens straight to a tag from a link and clears the filter with All notes', async () => {
    const { user } = await open(`/notes?folder=${encodeURIComponent(tagPlace(work.id))}`);
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Plan']);
    });
    await user.click(screen.getByRole('link', { name: 'All notes' }));
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Plan', 'Brain', 'Plain']);
    });
  });

  it('shows a hint when no note has a tag yet', async () => {
    await openNotes(createFakeApi([], [unused], [], [], [makeNote({ title: 'Solo' })]));
    expect(await screen.findByText('Type #tag in a note to add one.')).toBeInTheDocument();
  });

  it('falls back to All notes when the tag in the link does not exist', async () => {
    const gone = makeTag({ name: 'gone' });
    const { router } = await open(`/notes?folder=${encodeURIComponent(tagPlace(gone.id))}`);
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty('folder');
    });
    expect(tagList()).toBeInTheDocument();
  });

  it('keeps New note out of any folder while a tag is shown', async () => {
    const { user, fake } = await open(`/notes?folder=${encodeURIComponent(tagPlace(work.id))}`);
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Plan']);
    });
    await user.click(newNoteButton());
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/notes')).toHaveLength(1);
    });
    expect(callsTo(fake, 'POST', '/notes')[0]?.body).toEqual({});
  });

  it('is a single icon button while the side panel is collapsed', async () => {
    const { user } = await open();
    await user.click(await screen.findByRole('button', { name: 'Collapse side panel' }));
    expect(screen.queryByRole('region', { name: 'Tags' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Tags, expand the side panel/ }));
    expect(await screen.findByRole('region', { name: 'Tags' })).toBeInTheDocument();
  });
});

describe('the Today and Templates rows', () => {
  it('shows the India date as a hint and opens the daily note on click', async () => {
    const { user } = await open();
    const today = screen.getByRole('button', { name: /^Today/ });
    expect(today).toHaveTextContent('7 Oct');
    await user.click(today);
    expect(openDaily).toHaveBeenCalledTimes(1);
  });

  it('shows the templates view in place of the list and the editor', async () => {
    const { user, router } = await open();
    await user.click(screen.getByRole('link', { name: 'Templates' }));
    expect(await screen.findByRole('region', { name: 'Templates' })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ folder: 'templates' });
    expect(screen.queryByRole('region', { name: 'Notes list' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'All notes' }));
    expect(await screen.findByRole('region', { name: 'Notes list' })).toBeInTheDocument();
  });
});

describe('the D key', () => {
  it('opens the daily note', async () => {
    const { user } = await open();
    await user.keyboard('d');
    expect(openDaily).toHaveBeenCalledTimes(1);
  });

  it('does nothing with a modifier, in a field, or while the help is open', async () => {
    const { user } = await open();
    await user.keyboard('{Control>}d{/Control}');
    await user.click(screen.getByRole('searchbox', { name: 'Filter notes' }));
    await user.keyboard('d');
    expect(openDaily).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    await user.keyboard('d');
    expect(openDaily).not.toHaveBeenCalled();
  });

  it('is listed in the shortcut help', async () => {
    const { user } = await open();
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Open today’s daily note')).toBeInTheDocument();
  });
});

describe('the place in the link', () => {
  it('accepts templates and tags, and drops a bad tag id', () => {
    expect(validateNotesSearch({ folder: 'templates' })).toEqual({ folder: 'templates' });
    expect(validateNotesSearch({ folder: tagPlace(work.id) })).toEqual({
      folder: tagPlace(work.id),
    });
    expect(validateNotesSearch({ folder: 'tag:nope' })).toEqual({});
  });
});
