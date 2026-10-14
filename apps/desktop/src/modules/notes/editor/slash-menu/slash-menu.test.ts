import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoteExtensions } from '../extensions';
import { serializeNote } from '../serialize';

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

let editor: Editor;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: createNoteExtensions(),
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

const blocks = (): JSONContent[] => editor.getJSON().content as JSONContent[];
/** Rows and columns of the first table, and the type of its first cell. */
const tableShape = () => {
  const table = blocks().find((n) => n.type === 'table');
  const rows = table?.content ?? [];
  const first = rows[0]?.content ?? [];
  return { rows: rows.length, columns: first.length, firstCell: first[0]?.type };
};

const menu = () => document.querySelector<HTMLElement>('[role="listbox"]');
const rowTexts = () =>
  [...document.querySelectorAll('[role="option"]')].map((row) =>
    (row.querySelector('.suggestion-row-text') ?? row).textContent.trim(),
  );

function press(key: string) {
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

async function opened(expected?: string[]) {
  await vi.waitFor(() => {
    expect(menu()).not.toBeNull();
    if (expected) expect(rowTexts()).toEqual(expected);
  });
}

const BLOCKS = [
  'Heading 1',
  'Heading 2',
  'Heading 3',
  'Bullet list',
  'Numbered list',
  'Checklist',
  'Quote',
  'Code block',
  'Table',
  'Divider',
];

describe('the slash menu', () => {
  it('opens on / in an empty line with the ten blocks in order and no table commands', async () => {
    editor.commands.insertContent('/');
    await opened(BLOCKS);
    expect(menu()).toHaveAttribute('aria-label', 'Insert a block');
    expect(menu()?.parentElement).toBe(document.body);
  });

  it('opens after a space, and not in the middle of a word or a web address', async () => {
    editor.commands.insertContent('word /');
    await opened();
    editor.commands.setContent('', { contentType: 'markdown' });
    editor.commands.focus();
    editor.commands.insertContent('and/or https://x.y/');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(menu()).toBeNull();
  });

  it('does not open at the start of a line that has text', async () => {
    editor.commands.setContent('hello', { contentType: 'markdown' });
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('/');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(menu()).toBeNull();
  });

  it('does not open in a code block', async () => {
    editor.commands.setContent('```\n\n```', { contentType: 'markdown' });
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('/');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(menu()).toBeNull();
  });

  it('filters by the typed text and by keywords', async () => {
    editor.commands.insertContent('/head');
    await opened(['Heading 1', 'Heading 2', 'Heading 3']);
    editor.commands.insertContent('ing 2');
    // a space closes the menu: the typed text may not contain one
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
  });

  it('finds Checklist with the word todo', async () => {
    editor.commands.insertContent('/todo');
    await opened(['Checklist']);
  });

  it('hides when nothing matches and leaves Enter alone', async () => {
    editor.commands.insertContent('/zzz');
    await vi.waitFor(() => {
      expect(menu()?.hidden).toBe(true);
    });
    press('Enter');
    // Enter was not taken by the menu: it split the line as usual
    expect(blocks()).toHaveLength(2);
  });

  it('stops pointing the editor at a row when nothing matches', async () => {
    editor.commands.insertContent('/');
    await opened();
    expect(editor.view.dom.getAttribute('aria-activedescendant')).not.toBeNull();
    editor.commands.insertContent('zzz');
    await vi.waitFor(() => {
      expect(menu()?.hidden).toBe(true);
    });
    expect(editor.view.dom.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('leaves no menu behind when Ctrl+K takes the focus away (the palette opens)', async () => {
    editor.commands.insertContent('/');
    await opened();
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
    // The palette's input takes the focus
    const palette = document.createElement('input');
    document.body.append(palette);
    // What the browser reports when the focus moves from the editor to the palette
    editor.view.dom.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: palette }),
    );
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(0);
    });
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false);
  });

  it('moves with the arrows and runs the chosen item with Enter', async () => {
    editor.commands.insertContent('/');
    await opened();
    press('ArrowDown');
    press('ArrowDown');
    expect(document.querySelectorAll('[role="option"]')[2]).toHaveAttribute(
      'aria-selected',
      'true',
    );
    press('Enter');
    expect(serializeNote(editor)).toBe('');
    expect(blocks()[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
    });
    expect(menu()).toBeNull();
  });

  it('closes with Escape and keeps the typed text', async () => {
    editor.commands.insertContent('/qu');
    await opened(['Quote']);
    press('Escape');
    expect(menu()).toBeNull();
    expect(editor.getText()).toBe('/qu');
  });

  const CHOICES: [word: string, markdown: string][] = [
    ['/heading', '# x'],
    ['/bullet', '- x'],
    ['/numbered', '1. x'],
    ['/check', '- [ ] x'],
    ['/quote', '> x'],
    ['/code', '```\nx\n```'],
    ['/divider', '---\n\nx'],
  ];
  for (const [word, expected] of CHOICES) {
    it(`turns ${word} into the right block`, async () => {
      editor.commands.insertContent(word);
      await opened();
      press('Enter');
      editor.commands.insertContent('x');
      expect(serializeNote(editor)).toBe(expected);
    });
  }

  it('inserts a table of 3 by 3 with a header row, and the table commands then show', async () => {
    editor.commands.insertContent('/table');
    await opened(['Table']);
    press('Enter');
    expect(tableShape()).toEqual({ rows: 3, columns: 3, firstCell: 'tableHeader' });

    editor.commands.insertContent('/');
    await opened();
    expect(rowTexts()).toEqual([
      ...BLOCKS.filter((b) => b !== 'Table'),
      'Add row',
      'Add column',
      'Delete row',
      'Delete column',
      'Delete table',
    ]);
  });
});

describe('the slash menu inside a table', () => {
  beforeEach(() => {
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
  });

  const shape = () => [tableShape().rows, tableShape().columns];

  async function choose(word: string, title: string) {
    editor.commands.insertContent(`/${word}`);
    await vi.waitFor(() => {
      expect(rowTexts()).toContain(title);
    });
    // only the wanted row is shown when the word is specific enough
    const index = rowTexts().indexOf(title);
    for (let i = 0; i < index; i++) press('ArrowDown');
    press('Enter');
  }

  it('adds a row and a column', async () => {
    await choose('add', 'Add row');
    expect(shape()).toEqual([4, 3]);
    await choose('add', 'Add column');
    expect(shape()).toEqual([4, 4]);
  });

  it('deletes a row and a column', async () => {
    await choose('delete', 'Delete row');
    expect(shape()).toEqual([2, 3]);
    await choose('delete', 'Delete column');
    expect(shape()).toEqual([2, 2]);
  });

  it('deletes the table', async () => {
    await choose('delete', 'Delete table');
    expect(blocks().some((n) => n.type === 'table')).toBe(false);
  });

  it('does not offer Table inside a table', async () => {
    editor.commands.insertContent('/tab');
    await opened(['Add row', 'Add column', 'Delete row', 'Delete column', 'Delete table']);
  });
});
