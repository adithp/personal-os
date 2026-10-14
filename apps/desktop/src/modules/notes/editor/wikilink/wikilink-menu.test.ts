import { Editor } from '@tiptap/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoteExtensions } from '../extensions';
import { serializeNote } from '../serialize';
import { refreshWikilinks } from './wikilink';

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

const TITLES = [
  { id: 'n1', title: 'Garden plan' },
  { id: 'n2', title: 'Groceries' },
  { id: 'n3', title: 'Reading list' },
];

let editor: Editor;
let host: HTMLElement;
const onOpen = vi.fn();
let known: Record<string, string> = {};

beforeEach(() => {
  onOpen.mockReset();
  known = { 'garden plan': 'n1' };
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: createNoteExtensions({
      getTitles: () => TITLES,
      resolve: (title) => known[title.toLowerCase()] ?? null,
      onOpen,
    }),
    content: '',
    contentType: 'markdown',
  });
  editor.commands.focus();
});

afterEach(() => {
  editor.destroy();
  host.remove();
  document.body.replaceChildren();
});

const menu = () => document.querySelector<HTMLElement>('[role="listbox"]');
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const rowTexts = () => rows().map((row) => row.textContent);

function press(key: string) {
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

/** Puts text in as a paste would (no typing rules). */
function type(text: string) {
  editor.commands.insertContent(text);
}

/** Types one character the way the browser does: input rules first, then the character itself. */
function typeChar(char: string) {
  const { view } = editor;
  const { from, to } = view.state.selection;
  const handled = view.someProp('handleTextInput', (f) =>
    f(view, from, to, char, () => view.state.tr),
  );
  if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
}

describe('the [[ menu', () => {
  it('opens on [[ with the note titles and a Create row for text that matches no note', async () => {
    type('see [[g');
    await vi.waitFor(() => {
      expect(rowTexts()).toEqual(['Garden plan', 'Groceries', 'Reading list', 'Create "g"']);
    });
    expect(menu()).toHaveAttribute('aria-label', 'Link to a note');
    expect(menu()?.parentElement).toBe(document.body);
  });

  it('puts titles that start with the text first and does not offer Create for an exact title', async () => {
    type('[[reading list');
    await vi.waitFor(() => {
      expect(rowTexts()).toEqual(['Reading list']);
    });
  });

  it('moves with the arrow keys (wrapping), marks the row and points the editor at it', async () => {
    type('[[g');
    await vi.waitFor(() => {
      expect(rows()).toHaveLength(4);
    });
    expect(rows()[0]).toHaveAttribute('aria-selected', 'true');
    press('ArrowDown');
    expect(rows()[1]).toHaveAttribute('aria-selected', 'true');
    expect(editor.view.dom.getAttribute('aria-activedescendant')).toBe(rows()[1]?.id);
    press('ArrowUp');
    press('ArrowUp');
    expect(rows()[3]).toHaveAttribute('aria-selected', 'true');
    press('ArrowDown');
    expect(rows()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('inserts the chosen title with Enter and writes [[title]]', async () => {
    type('go [[gro');
    await vi.waitFor(() => {
      expect(rows()[0]).toHaveTextContent('Groceries');
    });
    press('Enter');
    expect(serializeNote(editor)).toBe('go [[Groceries]]');
    expect(menu()).toBeNull();
  });

  it('inserts a link for the Create row without creating anything', async () => {
    type('[[Brand new');
    await vi.waitFor(() => {
      expect(rowTexts()).toEqual(['Create "Brand new"']);
    });
    press('Enter');
    expect(serializeNote(editor)).toBe('[[Brand new]]');
  });

  it('inserts a row with a click and keeps the editor focused', async () => {
    type('[[g');
    await vi.waitFor(() => {
      expect(rows()).toHaveLength(4);
    });
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    rows()[1]?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    rows()[1]?.click();
    expect(serializeNote(editor)).toBe('[[Groceries]]');
  });

  it('closes on Escape and leaves the typed text', async () => {
    type('[[g');
    await vi.waitFor(() => {
      expect(menu()).not.toBeNull();
    });
    press('Escape');
    expect(menu()).toBeNull();
    expect(editor.getText()).toBe('[[g');
  });

  it('closes when ] is typed and typing [[a]] by hand makes a link', async () => {
    type('[[Plain');
    await vi.waitFor(() => {
      expect(menu()).not.toBeNull();
    });
    typeChar(']');
    typeChar(']');
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
    expect(serializeNote(editor)).toBe('[[Plain]]');
  });

  it('does not open inside inline code or a code block', async () => {
    editor.commands.setContent('```\n\n```', { contentType: 'markdown' });
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('[[g');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(menu()).toBeNull();
  });

  it('shows no menu when there are no notes and nothing is typed', async () => {
    editor.destroy();
    editor = new Editor({
      element: host,
      extensions: createNoteExtensions({ getTitles: () => [] }),
      content: '',
      contentType: 'markdown',
    });
    editor.commands.focus();
    editor.commands.insertContent('[[');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(rows()).toHaveLength(0);
  });

  it('shows note titles as text, never as markup', async () => {
    editor.destroy();
    editor = new Editor({
      element: host,
      extensions: createNoteExtensions({
        getTitles: () => [{ id: 'x', title: '<img src=x onerror=alert(1)>' }],
      }),
      content: '',
      contentType: 'markdown',
    });
    editor.commands.focus();
    editor.commands.insertContent('[[img');
    await vi.waitFor(() => {
      expect(rows()[0]).toHaveTextContent('<img src=x onerror=alert(1)>');
    });
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('the wikilink node in the page', () => {
  beforeEach(() => {
    editor.commands.setContent('[[Garden plan]] and [[Missing#part|shown]]', {
      contentType: 'markdown',
    });
  });

  const links = () => [...host.querySelectorAll<HTMLElement>('[data-type="wikiLink"]')];

  it('draws a resolved link and an unresolved link differently', () => {
    expect(links().map((l) => l.textContent)).toEqual(['Garden plan', 'shown']);
    expect(links()[0]).toHaveClass('wikilink-resolved');
    expect(links()[1]).toHaveClass('wikilink-unresolved');
    expect(links()[1]).toHaveAttribute('title', 'Not created yet. Click to create it.');
  });

  it('follows the titles after refreshWikilinks', () => {
    known.missing = 'n9';
    expect(links()[1]).toHaveClass('wikilink-unresolved');
    refreshWikilinks(editor);
    expect(links()[1]).toHaveClass('wikilink-resolved');
  });

  it('opens the note on click, with the heading part removed', () => {
    links()[1]?.click();
    expect(onOpen).toHaveBeenCalledWith('Missing');
    links()[0]?.click();
    expect(onOpen).toHaveBeenLastCalledWith('Garden plan');
  });

  it('opens the note with Enter when the link is selected', () => {
    editor.commands.setNodeSelection(1);
    press('Enter');
    expect(onOpen).toHaveBeenCalledWith('Garden plan');
  });

  it('copies as the shown text', () => {
    expect(editor.getText()).toBe('Garden plan and shown');
  });

  it('removes a whole link with one Backspace', () => {
    editor.commands.setContent('a [[x]]', { contentType: 'markdown' });
    editor.commands.setNodeSelection(3);
    press('Backspace');
    expect(serializeNote(editor)).toBe('a');
  });
});
