import type * as TauriWindow from '@tauri-apps/api/window';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, makeNote, type FakeApi } from '../../../test/fake-api';
import { makeVersion } from '../../../test/fake-note-versions';
import { useNotesUi } from '../notes-ui-store';
import { callsTo, openNotes, resetEverything, restoreEverything } from '../test-utils';
import { resetVersionPreview } from './preview-store';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(() => {
  resetEverything();
  resetVersionPreview();
});
afterEach(restoreEverything);

// The test clock: 3:00 PM on 7 October 2025 in India (09:30 UTC)
const TODAY_AFTERNOON = '2025-10-07T09:00:00.000Z'; // 14:30 IST, 7 Oct
const JUST_AFTER_MIDNIGHT = '2025-10-06T18:40:00.000Z'; // 00:10 IST, 7 Oct (still 6 Oct in UTC)
const LATE_YESTERDAY = '2025-10-06T18:20:00.000Z'; // 23:50 IST, 6 Oct
const OLD = '2025-10-01T08:02:00.000Z'; // 13:32 IST, 1 Oct

const CURRENT = 'Line one\nLine two\nLine three';

function sample() {
  const note = makeNote({ title: 'Plan', contentMd: CURRENT });
  const fake = createFakeApi([], [], [], [], [note]);
  fake.noteVersions.seed(note.id, [
    makeVersion({ createdAt: OLD, contentMd: 'Line one' }),
    makeVersion({
      createdAt: LATE_YESTERDAY,
      reason: 'before_restore',
      contentMd: 'Line one\nLine two',
    }),
    makeVersion({
      createdAt: JUST_AFTER_MIDNIGHT,
      reason: 'conflict',
      contentMd: 'Line one\nOld two\nLine three',
    }),
    makeVersion({
      createdAt: TODAY_AFTERNOON,
      contentMd: 'Line one',
    }),
  ]);
  return { note, fake };
}

async function openHistory(fake: FakeApi, noteId: string) {
  useNotesUi.setState({ rightPanelOpen: true, rightPanelTab: 'history' });
  const opened = await openNotes(fake, `/notes?note=${noteId}`);
  return opened;
}

const editorDom = () => {
  const dom = document.querySelector<HTMLElement>('.ProseMirror');
  if (!dom) throw new Error('editor not mounted');
  return dom;
};

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Missing element');
  return value;
}

const rowAt = (index: number): HTMLElement => {
  const row = rows().at(index);
  if (!row) throw new Error(`No version row ${String(index)}`);
  return row;
};
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-roving]')];

describe('the History tab', () => {
  it('lists the versions newest first, grouped by India day, with reason words and word changes', async () => {
    const { note, fake } = sample();
    await openHistory(fake, note.id);

    await screen.findByRole('heading', { name: 'Today' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Today',
      'Yesterday',
      '1 Oct',
    ]);
    // 00:10 India time is still 7 Oct, although it is 6 Oct in UTC; 23:50 is 6 Oct
    expect(rows().map((row) => row.textContent)).toEqual([
      '14:30−4 words',
      '00:10Conflict+2 words',
      '23:50Before restore+2 words',
      '13:32+2 words',
    ]);
    const today = screen.getByRole('heading', { name: 'Today' }).closest('section');
    expect(within(must(today)).getAllByRole('button')).toHaveLength(2);
  });

  it('says so when there are no earlier versions', async () => {
    const note = makeNote({ title: 'Plan', contentMd: CURRENT });
    await openHistory(createFakeApi([], [], [], [], [note]), note.id);
    expect(
      await screen.findByText('No earlier versions yet. Versions are saved while you edit.'),
    ).toBeInTheDocument();
  });

  it('shows the server message and tries again', async () => {
    const { note, fake } = sample();
    fake.failNext(500, 'boom', 'The server is busy.', `/notes/${note.id}/versions`);
    const { user } = await openHistory(fake, note.id);
    expect(await screen.findByText('The server is busy.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });

  it('moves between versions with the arrow keys and opens one with Enter', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });

    const [first, second] = rows();
    first?.focus();
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{End}');
    expect(rowAt(-1)).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(await screen.findByRole('region', { name: 'Version preview' })).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-current', 'true');
  });
});

describe('previewing a version', () => {
  it('shows the version read-only, saves nothing, and puts the text back on Close', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });
    await waitFor(() => {
      expect(editorDom().textContent).toContain('Line three');
    });

    await user.click(rowAt(2)); // the 23:50 version
    const bar = await screen.findByRole('region', { name: 'Version preview' });
    expect(within(bar).getByText('Version from 6 Oct, 23:50')).toBeInTheDocument();
    await waitFor(() => {
      expect(editorDom().textContent).not.toContain('Line three');
    });
    expect(editorDom().textContent).toContain('Line two');
    expect(editorDom()).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('readonly');

    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(callsTo(fake, 'PATCH', `/notes/${note.id}`)).toHaveLength(0);

    await user.click(within(bar).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Version preview' })).toBeNull();
    });
    expect(editorDom().textContent).toContain('Line three');
    expect(editorDom()).toHaveAttribute('contenteditable', 'true');
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(callsTo(fake, 'PATCH', `/notes/${note.id}`)).toHaveLength(0);
  });

  it('closes with Escape inside the bar', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });
    await user.click(rowAt(0));
    const bar = await screen.findByRole('region', { name: 'Version preview' });
    within(bar).getByRole('button', { name: 'Close' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Version preview' })).toBeNull();
  });

  it('shows the changes against the current text with signs, and hides them again', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });
    await user.click(rowAt(1)); // 00:10: "Old two" instead of "Line two"
    const bar = await screen.findByRole('region', { name: 'Version preview' });
    await waitFor(() => {
      expect(editorDom().textContent).toContain('Old two');
    });

    const toggle = within(bar).getByRole('switch', { name: 'Show changes' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    const diff = await screen.findByRole('group', { name: /Changes compared/ });
    const added = must(diff.querySelector<HTMLElement>('[data-diff="add"]'));
    const removed = must(diff.querySelector<HTMLElement>('[data-diff="remove"]'));
    expect(added).toHaveTextContent('+Added: Old two');
    expect(removed).toHaveTextContent('−Removed: Line two');
    expect(removed).toHaveClass('line-through', 'text-danger');
    expect(added).toHaveClass('bg-accent/20');
    expect(diff.querySelectorAll('[data-diff="same"]')).toHaveLength(2);

    await user.click(toggle);
    expect(screen.queryByRole('group', { name: /Changes compared/ })).toBeNull();
  });

  it('can be reached with the keyboard: switch, Restore and Close are buttons in the tab order', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });
    await user.click(rowAt(0));
    const bar = await screen.findByRole('region', { name: 'Version preview' });
    await waitFor(() => {
      expect(within(bar).getByRole('button', { name: 'Restore' })).toBeEnabled();
    });
    const switchEl = within(bar).getByRole('switch', { name: 'Show changes' });
    switchEl.focus();
    await user.keyboard(' ');
    expect(switchEl).toBeChecked();
    await user.tab();
    expect(within(bar).getByRole('button', { name: 'Restore' })).toHaveFocus();
    await user.tab();
    expect(within(bar).getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('shows a message and Try again when the version cannot be loaded', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });
    fake.failNext(500, 'boom', 'That version is not ready.', `/notes/${note.id}/versions/`);
    await user.click(rowAt(0));
    expect(await screen.findByText('That version is not ready.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Version from 7 Oct, 14:30/)).toBeInTheDocument();
  });
});

describe('restoring a version', () => {
  it('puts the text back, shows an Undo toast and closes the preview; Undo brings the text back', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });
    const target = fake.noteVersions.versions(note.id)[1];
    await user.click(rowAt(1)); // "Line one / Old two / Line three"
    const bar = await screen.findByRole('region', { name: 'Version preview' });
    await waitFor(() => {
      expect(within(bar).getByRole('button', { name: 'Restore' })).toBeEnabled();
    });
    await user.click(within(bar).getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Version preview' })).toBeNull();
    });
    expect(callsTo(fake, 'POST', `/notes/${note.id}/restore/${target?.id ?? ''}`)).toHaveLength(1);
    await waitFor(() => {
      expect(editorDom().textContent).toContain('Old two');
    });
    expect(editorDom()).toHaveAttribute('contenteditable', 'true');
    expect(fake.notes()[0]?.contentMd).toBe('Line one\nOld two\nLine three');
    // The current text was kept as a version first
    expect(fake.noteVersions.versions(note.id)[0]).toMatchObject({ reason: 'before_restore' });

    const toast = useToasts.getState().toasts.find((t) => t.message === 'Version restored.');
    expect(toast?.action?.label).toBe('Undo');
    await act(async () => {
      toast?.action?.onClick();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(editorDom().textContent).toContain('Line two');
    });
    expect(callsTo(fake, 'POST', '/undo')).toHaveLength(1);
    expect(fake.notes()[0]?.contentMd).toBe(CURRENT);
    // Neither the restore nor the undo was saved by the editor itself
    expect(callsTo(fake, 'PATCH', `/notes/${note.id}`)).toHaveLength(0);
  });

  it('shows the server message when the restore fails and keeps the preview', async () => {
    const { note, fake } = sample();
    const { user } = await openHistory(fake, note.id);
    await screen.findByRole('heading', { name: 'Today' });
    await user.click(rowAt(0));
    const bar = await screen.findByRole('region', { name: 'Version preview' });
    await waitFor(() => {
      expect(within(bar).getByRole('button', { name: 'Restore' })).toBeEnabled();
    });
    fake.failNext(404, 'not_found', 'Version not found', `/notes/${note.id}/restore/`);
    await user.click(within(bar).getByRole('button', { name: 'Restore' }));
    await waitFor(() => {
      expect(useToasts.getState().toasts.some((t) => t.message === 'Version not found')).toBe(true);
    });
    expect(screen.getByRole('region', { name: 'Version preview' })).toBeInTheDocument();
  });
});

describe('look', () => {
  it('uses no hard-coded colors in the list, the bar or the diff, in dark and light', async () => {
    for (const theme of ['dark', 'light'] as const) {
      useSettings.setState({ theme });
      const { note, fake } = sample();
      const { user } = await openHistory(fake, note.id);
      await screen.findByRole('heading', { name: 'Today' });
      await user.click(rowAt(1));
      const bar = await screen.findByRole('region', { name: 'Version preview' });
      await waitFor(() => {
        expect(editorDom().textContent).toContain('Old two');
      });
      await user.click(within(bar).getByRole('switch', { name: 'Show changes' }));
      await screen.findByRole('group', { name: /Changes compared/ });
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
      cleanup();
      resetVersionPreview();
    }
  });
});
