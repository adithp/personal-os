import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeNote, makeTag } from '../../../test/fake-api';
import { useNotesUi } from '../notes-ui-store';
import { openNotes, resetEverything, restoreEverything, rowTitles } from '../test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../editor/note-editor-pane', async () => {
  const { RightPanelToggle } = await import('./right-panel-toggle');
  return {
    NoteEditorPane: ({ noteId }: { noteId: string }) => (
      <div data-testid="editor">
        {noteId}
        <RightPanelToggle />
      </div>
    ),
  };
});

beforeEach(resetEverything);
afterEach(restoreEverything);

const work = makeTag({ name: 'work', color: '#F7D96B' });

async function openPanel(contentMd: string) {
  const note = makeNote({ title: 'Plan', contentMd });
  const other = makeNote({ title: 'Other', contentMd: 'Also #work' });
  useNotesUi.setState({ rightPanelOpen: true });
  const opened = await openNotes(
    createFakeApi([], [work], [], [], [note, other]),
    `/notes?note=${note.id}`,
  );
  const section = await screen.findByRole('region', { name: /^Tags \(/ });
  return { ...opened, section };
}

describe('the Tags section of the Links tab', () => {
  it('lists the tags in the text of the open note', async () => {
    const { section } = await openPanel('Ship #work now and #fresh');
    expect(within(section).getByRole('heading', { name: 'Tags (2)' })).toBeInTheDocument();
    expect(
      within(section)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['#work', '#fresh']);
  });

  it('shows a hint when the note has no tags', async () => {
    const { section } = await openPanel('Nothing here');
    expect(within(section).getByText('Type #tag in the text to add one.')).toBeInTheDocument();
  });

  it('filters the list by a tag when it is chosen', async () => {
    const { section, user, router } = await openPanel('Ship #work now');
    await user.click(within(section).getByRole('button', { name: 'Show notes tagged #work' }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ folder: `tag:${work.id}` });
    });
    await waitFor(() => {
      expect(rowTitles()).toEqual(['Plan', 'Other']);
    });
  });

  it('cannot filter by a tag the server has not created yet, but it stays in the key order', async () => {
    const { section, user } = await openPanel('A #fresh tag');
    const chip = within(section).getByRole('button', { name: 'Show notes tagged #fresh' });
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    await user.click(chip);
    expect(screen.getByRole('heading', { name: 'All notes' })).toBeInTheDocument();
  });
});
