import type { Note, UpdateNoteInput } from '@personal-os/shared';
import type { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/api-client';
import { NoteEditorPane } from './note-editor-pane';

const mocks = vi.hoisted(() => ({
  note: undefined as Note | undefined,
  update: vi.fn(),
  rename: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('../notes-queries', () => ({
  useNote: () => ({
    isPending: false,
    isError: false,
    data: mocks.note,
    refetch: mocks.refetch,
  }),
  useUpdateNote: () => ({ mutateAsync: mocks.update }),
  useRenameNote: () => ({ mutateAsync: mocks.rename }),
}));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

const NOW = new Date('2025-10-07T06:30:00.000Z');

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Plan',
    folderId: null,
    pinned: false,
    excerpt: '',
    createdAt: '2025-10-07T06:00:00.000Z',
    updatedAt: '2025-10-07T06:28:00.000Z',
    deletedAt: null,
    contentMd: 'Hello world',
    revision: 3,
    ...over,
  };
}

function editorOf(): Editor {
  const dom = document.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror');
  if (!dom?.editor) throw new Error('editor not mounted');
  return dom.editor;
}

function typeText(text: string) {
  act(() => {
    editorOf().chain().focus('end').insertContent(text).run();
  });
}
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeAll(() => {
  // ProseMirror measures text when it scrolls the cursor into view (memo R4)
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  mocks.note = makeNote();
  mocks.update.mockReset();
  mocks.rename.mockReset();
  mocks.refetch.mockReset();
  mocks.update.mockImplementation((input: UpdateNoteInput) =>
    Promise.resolve(makeNote({ revision: input.baseRevision + 1, contentMd: input.contentMd })),
  );
});
afterEach(() => {
  vi.useRealTimers();
});

describe('NoteEditorPane', () => {
  it('shows the title, the text, the word count and when it was edited', () => {
    render(<NoteEditorPane noteId="n1" />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Plan');
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('2 words · Edited 2 min ago')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('saves the Markdown one second after a change and shows the status', async () => {
    render(<NoteEditorPane noteId="n1" />);
    typeText(' again');
    await tick(1000);
    expect(mocks.update).toHaveBeenCalledWith({
      id: '11111111-1111-4111-8111-111111111111',
      baseRevision: 3,
      contentMd: 'Hello world again',
    });
    await tick(0);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows "Not saved, retrying" when saving fails', async () => {
    mocks.update.mockRejectedValueOnce(new ApiError(0, 'network', 'offline'));
    render(<NoteEditorPane noteId="n1" />);
    typeText('!');
    await tick(1000);
    expect(screen.getByText('Not saved, retrying')).toBeInTheDocument();
    await tick(5000);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it('saves when the editor is left (unmount)', () => {
    const { unmount } = render(<NoteEditorPane noteId="n1" />);
    typeText('!');
    unmount();
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it('asks Keep mine or Use theirs after a conflict, and Keep mine saves with force', async () => {
    mocks.update.mockRejectedValueOnce(new ApiError(409, 'note_conflict', 'changed'));
    render(<NoteEditorPane noteId="n1" />);
    typeText('!');
    await tick(1000);
    expect(screen.getByText('This note was changed on another device.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    await tick(0);
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true, contentMd: 'Hello world!' }),
    );
    expect(screen.queryByText('This note was changed on another device.')).toBeNull();
  });

  it('Use theirs loads the server text into the editor', async () => {
    mocks.update.mockRejectedValueOnce(new ApiError(409, 'note_conflict', 'changed'));
    mocks.refetch.mockResolvedValue({ data: makeNote({ contentMd: 'Their text', revision: 9 }) });
    render(<NoteEditorPane noteId="n1" />);
    typeText('!');
    await tick(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Use theirs' }));
    await tick(0);
    expect(screen.getByText('Their text')).toBeInTheDocument();
    expect(screen.queryByText('This note was changed on another device.')).toBeNull();
    await tick(5000);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it('renames on Enter and moves into the text', async () => {
    mocks.rename.mockResolvedValue(makeNote({ title: 'New name', revision: 4 }));
    render(<NoteEditorPane noteId="n1" />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: 'New name' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    await tick(0);
    expect(mocks.rename).toHaveBeenCalledWith({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'New name',
    });
  });

  it('uses the revision from a rename as the base of the next save', async () => {
    mocks.rename.mockResolvedValue(makeNote({ title: 'New name', revision: 4 }));
    render(<NoteEditorPane noteId="n1" />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: 'New name' } });
    fireEvent.blur(title);
    await tick(0);
    typeText('!');
    await tick(1000);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ baseRevision: 4 }));
  });

  it('says so when the title is taken and keeps what was typed', async () => {
    mocks.rename.mockRejectedValue(new ApiError(409, 'note_title_taken', 'taken'));
    render(<NoteEditorPane noteId="n1" />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: 'Other' } });
    fireEvent.blur(title);
    await tick(0);
    expect(screen.getByText('A note with this title exists.')).toBeInTheDocument();
    expect(title).toHaveValue('Other');
    expect(title).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not let [ ] | # into the title', () => {
    render(<NoteEditorPane noteId="n1" />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: 'a [b] | #c' } });
    expect(title).toHaveValue('a b  c');
  });

  it('restores an unsent draft with the same revision and saves it', () => {
    localStorage.setItem(
      'personal-os.notes-draft.11111111-1111-4111-8111-111111111111',
      JSON.stringify({ markdown: 'Unsent text', baseRevision: 3 }),
    );
    render(<NoteEditorPane noteId="n1" />);
    expect(screen.getByText('Unsent text')).toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ contentMd: 'Unsent text', baseRevision: 3 }),
    );
  });

  it('shows the conflict bar for a draft made on an older revision', () => {
    localStorage.setItem(
      'personal-os.notes-draft.11111111-1111-4111-8111-111111111111',
      JSON.stringify({ markdown: 'Old draft', baseRevision: 1 }),
    );
    render(<NoteEditorPane noteId="n1" />);
    expect(screen.getByText('This note was changed on another device.')).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('uses no hard-coded colors', () => {
    render(<NoteEditorPane noteId="n1" />);
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
