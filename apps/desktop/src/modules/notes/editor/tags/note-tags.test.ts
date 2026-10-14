import { parseTags } from '@personal-os/shared';
import { Editor } from '@tiptap/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createNoteExtensions } from '../extensions';
import { serializeNote } from '../serialize';
import { findTags, pickTags, refreshNoteTags, type NoteTagInfo } from './note-tags';

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

let tags: NoteTagInfo[] = [];
let editor: Editor;
let host: HTMLElement;

function start(markdown: string) {
  editor = new Editor({
    element: host,
    extensions: createNoteExtensions(undefined, { getTags: () => tags }),
    content: markdown,
    contentType: 'markdown',
  });
  editor.commands.focus('end');
}

beforeEach(() => {
  tags = [
    { name: 'work', color: '#F7D96B' },
    { name: 'Ideas', color: '#A8E6CF' },
    { name: 'workout', color: '#B8C1EC' },
  ];
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  editor.destroy();
  document.body.replaceChildren();
});

const chips = () => [...host.querySelectorAll<HTMLElement>('.note-tag')];
const menu = () => document.querySelector<HTMLElement>('[role="listbox"]');
const rowTexts = () =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((row) => row.textContent);

describe('#tag chips', () => {
  it('draws a tag in the tag color and a new tag in the default look', () => {
    start('Plan #work and #fresh');
    expect(chips().map((chip) => chip.textContent)).toEqual(['#work', '#fresh']);
    expect(chips()[0]?.style.getPropertyValue('--tag-color')).toBe('#F7D96B');
    expect(chips()[1]?.style.getPropertyValue('--tag-color')).toBe('');
  });

  it('matches the tag name ignoring case', () => {
    start('Ideas: #ideas');
    expect(chips()[0]?.style.getPropertyValue('--tag-color')).toBe('#A8E6CF');
  });

  it('draws the same tags the server reads from the text', () => {
    const md =
      'Start #one, then a#two, #1984, #ok_name and #a/b\n\n```\n#incode\n```\n\nUse `#inline` and #last\n\n# Heading';
    start(md);
    expect(chips().map((chip) => chip.textContent)).toEqual(
      parseTags(serializeNote(editor)).map((name) => `#${name}`),
    );
  });

  it('skips code, URL fragments, digit-only names and heading markers', () => {
    start('http://x.dev/page#top and #2024 and `#code`\n\n```\n#fenced\n```\n\n# Title');
    expect(chips()).toHaveLength(0);
  });

  it('keeps the text plain: the saved Markdown has the tag as typed', () => {
    start('Plan #work_item and #Ideas');
    expect(serializeNote(editor)).toContain('#Ideas');
    expect(parseTags(serializeNote(editor))).toEqual(['work_item', 'Ideas']);
  });

  it('follows a change of the tag colors after a refresh', () => {
    start('#work');
    tags = [{ name: 'work', color: '#112233' }];
    refreshNoteTags(editor);
    expect(chips()[0]?.style.getPropertyValue('--tag-color')).toBe('#112233');
  });

  it('never puts a color that is not #RRGGBB into a style', () => {
    tags = [{ name: 'work', color: 'red; background: url(x)' }];
    start('#work');
    expect(chips()[0]?.getAttribute('style')).toBeNull();
  });

  it('finds the exact place of each tag', () => {
    start('ab #cd');
    expect(findTags(editor.state.doc)).toEqual([{ from: 4, to: 7, name: 'cd' }]);
  });
});

describe('the # menu', () => {
  it('opens on # with the tags that exist, names that start with the text first', async () => {
    start('');
    editor.commands.insertContent('see #wor');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rowTexts()).toEqual(['#work', '#workout']);
    expect(menu()).toHaveAttribute('aria-label', 'Insert a tag');
  });

  it('inserts the chosen tag with a space after it', async () => {
    start('');
    editor.commands.insertContent('see #wor');
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.querySelector<HTMLElement>('[role="option"]')?.click();
    expect(serializeNote(editor).trim()).toBe('see #work');
    expect(editor.getText()).toBe('see #work ');
    expect(menu()).toBeNull();
  });

  it('does not open inside code', async () => {
    start('');
    editor.commands.setCodeBlock();
    editor.commands.insertContent('#wor');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(menu()).toBeNull();
  });

  it('closes when the text cannot be a tag', async () => {
    start('');
    editor.commands.insertContent('see #wo.');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(menu()).toBeNull();
  });

  it('puts the best matches first and shows at most 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      name: `t${String(i)}`,
      color: '#000000',
    }));
    expect(pickTags([{ name: 'at1', color: '#000000' }, ...many], 't1').map((t) => t.name)).toEqual(
      ['t1', 't10', 't11', 'at1'],
    );
    expect(pickTags(many, '')).toHaveLength(8);
  });
});
