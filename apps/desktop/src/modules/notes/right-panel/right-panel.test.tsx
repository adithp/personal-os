import type * as TauriWindow from '@tauri-apps/api/window';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { createFakeApi, makeNote } from '../../../test/fake-api';
import { useNotesUi } from '../notes-ui-store';
import { callsTo, openNotes, resetEverything, restoreEverything } from '../test-utils';
import { registerHeadingJump } from './outline-bus';
import { parseOutline } from './outline';
import { RightPanelToggle } from './right-panel-toggle';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../editor/note-editor-pane', () => ({
  NoteEditorPane: ({ noteId }: { noteId: string }) => <div data-testid="editor">{noteId}</div>,
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

/** Window width: true means narrower than 1240 px. */
function setNarrow(narrow: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: narrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const MD =
  '# Plan\n\nSee [[Beta]] and [[Ghost]].\n\n## Steps\n\n### Detail\n\n```\n# not a heading\n```\n';

const sample = () => {
  const alpha = makeNote({ title: 'Alpha', contentMd: MD });
  const beta = makeNote({ title: 'Beta', contentMd: 'Back to [[Alpha]] now' });
  return { alpha, beta };
};

const sectionOf = async (heading: string) => {
  const section = (await screen.findByRole('heading', { name: heading })).closest('section');
  if (!section) throw new Error('No section for ' + heading);
  return section;
};

const panel = () => screen.getByRole('complementary', { name: 'Links and outline' });

async function openWithPanel(narrow = false) {
  setNarrow(narrow);
  const { alpha, beta } = sample();
  useNotesUi.setState({ rightPanelOpen: true });
  const opened = await openNotes(
    createFakeApi([], [], [], [], [alpha, beta]),
    `/notes?note=${alpha.id}`,
  );
  return { ...opened, alpha, beta };
}

describe('the right panel', () => {
  it('is closed by default', async () => {
    setNarrow(false);
    const { alpha, beta } = sample();
    await openNotes(createFakeApi([], [], [], [], [alpha, beta]), `/notes?note=${alpha.id}`);
    await screen.findByTestId('editor');
    expect(screen.queryByRole('complementary', { name: 'Links and outline' })).toBeNull();
  });

  it('opens and closes from the toggle and the choice is saved on this device', async () => {
    const user = userEvent.setup();
    render(<RightPanelToggle />);
    await user.click(screen.getByRole('button', { name: 'Show links and outline' }));
    expect(useNotesUi.getState().rightPanelOpen).toBe(true);
    expect(localStorage.getItem('personal-os.notes-ui')).toContain('"rightPanelOpen":true');
    const hide = screen.getByRole('button', { name: 'Hide links and outline' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    await user.click(hide);
    expect(useNotesUi.getState().rightPanelOpen).toBe(false);
  });

  it('lists backlinks with their context and opens the note on click', async () => {
    const { user, beta } = await openWithPanel();
    const links = within(await sectionOf('Backlinks (1)'));
    expect(links.getByText('Beta')).toBeInTheDocument();
    expect(links.getByText('Back to [[Alpha]] now')).toBeInTheDocument();
    await user.click(links.getByRole('button', { name: /Beta/ }));
    await waitFor(() => {
      expect(screen.getByTestId('editor')).toHaveTextContent(beta.id);
    });
  });

  it('says so when no note links here', async () => {
    setNarrow(false);
    const alone = makeNote({ title: 'Alone' });
    useNotesUi.setState({ rightPanelOpen: true });
    await openNotes(createFakeApi([], [], [], [], [alone]), `/notes?note=${alone.id}`);
    expect(await screen.findByText('No notes link here yet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Backlinks (0)' })).toBeInTheDocument();
  });

  it('mutes outgoing links with no note and creates then opens the note from Create', async () => {
    const { user, fake } = await openWithPanel();
    const outgoing = within(await sectionOf('Outgoing links (2)'));
    expect(outgoing.getByRole('button', { name: /^Beta$/ })).toBeInTheDocument();
    expect(outgoing.getByText('Ghost')).toHaveClass('text-fg-muted');

    await user.click(outgoing.getByRole('button', { name: 'Create note: Ghost' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/notes')).toHaveLength(1);
    });
    expect(callsTo(fake, 'POST', '/notes')[0]?.body).toMatchObject({ title: 'Ghost' });
    const ghost = fake.notes().find((note) => note.title === 'Ghost');
    await waitFor(() => {
      expect(screen.getByTestId('editor')).toHaveTextContent(ghost?.id ?? 'none');
    });
  });

  it('shows the headings of the note, indented, and asks the editor to jump', async () => {
    const jump = vi.fn();
    const unregister = registerHeadingJump(jump);
    const { user } = await openWithPanel();
    await user.click(await screen.findByRole('radio', { name: 'Outline' }));
    const list = within(screen.getByRole('list', { name: 'Headings' }));
    expect(list.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Plan',
      'Steps',
      'Detail',
    ]);
    expect(list.getByRole('button', { name: 'Detail' })).toHaveStyle({ paddingLeft: '32px' });
    await user.click(list.getByRole('button', { name: 'Steps' }));
    expect(jump).toHaveBeenCalledWith(1);
    unregister();
  });

  it('moves between the tabs with the arrow keys', async () => {
    const { user } = await openWithPanel();
    await user.click(await screen.findByRole('radio', { name: 'Links' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Outline' })).toBeChecked();
    expect(within(panel()).queryByRole('radio', { name: 'History' })).toBeNull();
  });

  it('shows icons only in the side panel below 1240 px while it is open', async () => {
    await openWithPanel(true);
    await screen.findByRole('heading', { name: 'Backlinks (1)' });
    expect(screen.getByRole('button', { name: 'Expand side panel' })).toBeInTheDocument();
    // The saved choice is untouched
    expect(useNotesUi.getState().sidePanelCollapsed).toBe(false);
  });

  it('keeps the side panel as it was on a wide window', async () => {
    await openWithPanel(false);
    await screen.findByRole('heading', { name: 'Backlinks (1)' });
    expect(screen.getByRole('button', { name: 'Collapse side panel' })).toBeInTheDocument();
  });

  it('keeps the side panel open on a narrow window while the right panel is closed', async () => {
    setNarrow(true);
    const { alpha } = sample();
    await openNotes(createFakeApi([], [], [], [], [alpha]), `/notes?note=${alpha.id}`);
    await screen.findByTestId('editor');
    expect(screen.getByRole('button', { name: 'Collapse side panel' })).toBeInTheDocument();
  });

  it('shows an error with Try again when the links cannot be read', async () => {
    const { alpha } = sample();
    setNarrow(false);
    useNotesUi.setState({ rightPanelOpen: true });
    const fake = createFakeApi([], [], [], [], [alpha]);
    fake.failNext(500, 'server_error', 'Links are down.', `/notes/${alpha.id}/links`);
    const { user } = await openNotes(fake, `/notes?note=${alpha.id}`);
    expect(await screen.findByText('Links are down.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Backlinks (0)' })).toBeInTheDocument();
  });

  it.each(['dark', 'light'] as const)(
    'looks right in %s mode with no hard-coded colors',
    async (theme) => {
      useSettings.getState().update({ theme });
      await openWithPanel();
      await screen.findByRole('heading', { name: 'Backlinks (1)' });
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
    },
  );
});

describe('parseOutline', () => {
  it('reads H1 to H3 outside code, ignoring deeper and empty headings', () => {
    expect(parseOutline('# One\n#### Four\n##\n```\n## no\n```\n## **Two** [[A|b]] ##\n')).toEqual([
      { level: 1, text: 'One', index: 0 },
      { level: 2, text: 'Two b', index: 1 },
    ]);
  });
});
