import { Editor } from '@tiptap/core';
import { unescapeMarkdown } from '@personal-os/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createNoteExtensions } from './extensions';
import { serializeNote } from './serialize';

// ProseMirror measures text in jsdom; this stub keeps it quiet (research memo notes.md R4)
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

/** Loads markdown into a headless editor and writes it back the way saving does. */
function roundTrip(markdown: string): string {
  editor = new Editor({
    extensions: createNoteExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
  const out = serializeNote(editor);
  editor.destroy();
  editor = undefined;
  return out;
}

/** The markdown stays exactly the same after loading and saving. */
const STABLE: Record<string, string> = {
  'headings 1 to 3': '# One\n\n## Two\n\n### Three',
  'bold, italic and strike': '**bold** and *italic* and ~~strike~~',
  'bold and italic together': '***both*** here',
  'nested bullet lists': '- a\n  - b\n    - c\n- d',
  'nested ordered lists': '1. a\n   1. b\n2. c',
  'a bullet list after an ordered list': '1. a\n2. b\n\n- x',
  checklist: '- [ ] open\n- [x] done',
  'nested checklist': '- [ ] parent\n  - [x] child',
  blockquote: '> quoted\n> second line',
  'code block with [[ and #': '```\nlet a = "[[x]]";\n# not a heading\n\nmore\n```',
  'code block with a language': '```ts\nconst a = 1;\n```',
  'inline code': 'use `npm run dev` now',
  'inline code with [[ and #': 'write `[[Note]]` and `#tag` here',
  link: 'see [the docs](https://example.com/a?b=1)',
  'horizontal rule': 'above\n\n---\n\nbelow',
  'line break': 'line one  \nline two',
  Malayalam: 'മലയാളം എഴുതുന്നു\n\n## തലക്കെട്ട്',
  'two paragraphs': 'first\n\nsecond',
};

describe('markdown round trip', () => {
  for (const [name, markdown] of Object.entries(STABLE)) {
    it(`keeps ${name}`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  it('keeps a table, padded to equal column widths, and then stays the same', () => {
    const once = roundTrip('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(once).toBe('| A   | B   |\n| --- | --- |\n| 1   | 2   |');
    expect(roundTrip(once)).toBe(once);
  });

  it('keeps a table with links and bold in its cells, and text after it', () => {
    const once = roundTrip('| A | B |\n| --- | --- |\n| [x](http://a.b) | **b** |\n\nafter');
    expect(once).toContain('| [x](http://a.b) | **b** |');
    expect(once.endsWith('after')).toBe(true);
    expect(roundTrip(once)).toBe(once);
  });

  it('writes & < > * _ with escapes that the shared text helpers undo, and stays stable', () => {
    const text = 'Tom & Jerry, 1 < 2 > 0, 2 * 3 * 4, snake_case';
    const once = roundTrip(text.replace(/[*_]/g, '\\$&'));
    expect(once).toBe('Tom &amp; Jerry, 1 &lt; 2 &gt; 0, 2 \\* 3 \\* 4, snake\\_case');
    expect(unescapeMarkdown(once)).toBe(text);
    expect(roundTrip(once)).toBe(once);
  });

  it('keeps Malayalam next to formatting', () => {
    const md = '**മലയാളം** and *ടെക്സ്റ്റ്*\n\n- ഒന്ന്\n- രണ്ട്';
    expect(roundTrip(md)).toBe(md);
  });
});

describe('markdown that changes in a harmless way on the first save, then stays the same', () => {
  const NORMALIZED: Record<string, [input: string, output: string]> = {
    'a loose list becomes a tight list': ['- a\n\n- b', '- a\n- b'],
    'a plus list becomes a dash list': ['+ a\n+ b', '- a\n- b'],
    'stars for a rule become dashes': ['***', '---'],
    'an indented code block becomes fenced': ['    indented code', '```\nindented code\n```'],
    'a bare web address becomes a link': [
      'https://example.com auto',
      '[https://example.com](https://example.com) auto',
    ],
  };
  for (const [name, [input, output]] of Object.entries(NORMALIZED)) {
    it(name, () => {
      const once = roundTrip(input);
      expect(once).toBe(output);
      expect(roundTrip(once)).toBe(once);
    });
  }
});

describe('what the editor cannot keep (not offered; listed in the N1 report)', () => {
  it('drops underline markup but keeps the words', () => {
    expect(roundTrip('<u>under</u> and <b>x</b>')).toBe('under and **x**');
  });

  it('drops images but keeps the alt text', () => {
    expect(roundTrip('![img](http://a/b.png)')).toBe('img');
  });

  it('writes plain [[Note]] text with escapes until wikilinks exist (stage N2)', () => {
    expect(roundTrip('[[Note]] #tag')).toBe('\\[\\[Note\\]\\] #tag');
  });
});

describe('active content (security)', () => {
  /** What the editor shows after loading this Markdown. */
  function htmlOf(markdown: string): string {
    editor = new Editor({
      extensions: createNoteExtensions(),
      content: markdown,
      contentType: 'markdown',
    });
    return editor.getHTML();
  }

  it('keeps a javascript: link as text in the file but gives the link no address', () => {
    const markdown = '[x](javascript:alert(1))';
    // The Markdown is stored as typed, but the editor drops the unsafe address (href="")
    expect(roundTrip(markdown)).toBe(markdown);
    const html = htmlOf(markdown);
    expect(html).toContain('href=""');
    expect(html).not.toContain('javascript:');
  });

  it('drops raw HTML such as an img with onerror: nothing live reaches the editor', () => {
    const markdown = 'a <img src=x onerror=alert(1)> b';
    expect(roundTrip(markdown)).toBe('a  b');
    const html = htmlOf(markdown);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
  });
});
