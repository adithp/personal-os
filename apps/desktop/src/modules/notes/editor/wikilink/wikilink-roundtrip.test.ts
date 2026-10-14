import { Editor } from '@tiptap/core';
import { parseWikilinks } from '@personal-os/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createNoteExtensions } from '../extensions';
import { serializeNote } from '../serialize';

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function load(markdown: string): Editor {
  editor = new Editor({
    extensions: createNoteExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
  return editor;
}

function roundTrip(markdown: string): string {
  const out = serializeNote(load(markdown));
  editor?.destroy();
  editor = undefined;
  return out;
}

function linkNodes(ed: Editor): { target: string; label: string | null }[] {
  const found: { target: string; label: string | null }[] = [];
  ed.state.doc.descendants((node) => {
    if (node.type.name === 'wikiLink') {
      found.push({ target: String(node.attrs.target), label: node.attrs.label as string | null });
    }
  });
  return found;
}

const STABLE: Record<string, string> = {
  'a plain link': '[[a]]',
  'a link with shown text': '[[a|b]]',
  'a link with a heading': '[[a#h]]',
  'a link with a heading and shown text': '[[Note one#Part two|see this]]',
  'text around links': 'before [[a]] and [[b|c]], after.',
  'two links side by side': '[[a]][[b]]',
  'a link inside a heading': '## About [[a]]',
  'a link inside a list': '- one [[a]]\n- two [[b|c]]\n  - nested [[d]]',
  'a link inside a checklist': '- [ ] read [[a]]\n- [x] done [[b]]',
  'a link inside a quote': '> see [[a]]',
  'a link next to bold text and a normal link':
    '**bold** [[a]] and [web](https://example.com) and [[b]]',
  'Malayalam in a link': '[[മലയാളം]] and [[ഒന്ന്|രണ്ട്]]',
  'a link with symbols': '[[Q&A (2025) - draft_v2]]',
  'a link in code stays text': 'use `[[a]]` here',
  'a link in a code block stays text': '```\n[[a]] and [[b|c]]\n```',
};

describe('wikilink markdown round trip', () => {
  for (const [name, markdown] of Object.entries(STABLE)) {
    it(`keeps ${name}`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  it('beats the normal link rule: [[a]] is one wikiLink node and not a link with brackets', () => {
    const ed = load('[[a]] and [[b|c]] and [d](https://example.com)');
    expect(linkNodes(ed)).toEqual([
      { target: 'a', label: null },
      { target: 'b', label: 'c' },
    ]);
    // only the real web link is an <a>; the brackets did not become a link
    expect(ed.getHTML().match(/<a /g)).toHaveLength(1);
  });

  it('keeps the heading part in the target', () => {
    expect(linkNodes(load('[[a#h]]'))).toEqual([{ target: 'a#h', label: null }]);
  });

  it('keeps the link but drops bold around it (the markdown package marks only text)', () => {
    expect(roundTrip('**[[a]]** and **bold [[b]] more**')).toBe(
      '[[a]] and **bold** [[b]] **more**',
    );
  });

  it('keeps links in code as text and makes no node', () => {
    expect(linkNodes(load('`[[a]]`\n\n```\n[[b]]\n```'))).toEqual([]);
  });

  it('reads brackets that are not a link as plain text', () => {
    for (const text of ['[[]]', '[[a', 'a]]', '[[a\nb]]']) {
      expect(linkNodes(load(text))).toEqual([]);
    }
  });

  it('writes exactly what the server parser reads back', () => {
    const md = 'x [[a]] y [[b#h|c]] z\n\n- [[d]]';
    const out = roundTrip(md);
    expect(parseWikilinks(out).map((l) => l.target)).toEqual(['a', 'b', 'd']);
  });

  it('stays the same after a second pass', () => {
    const once = roundTrip('Intro [[a|b]]\n\n| x | y |\n| --- | --- |\n| [[c]] | z |');
    expect(roundTrip(once)).toBe(once);
  });

  it('keeps a plain link in a table cell', () => {
    const out = roundTrip('| x | y |\n| --- | --- |\n| [[c]] | z |');
    expect(out).toContain('[[c]]');
    expect(linkNodes(load(out))).toEqual([{ target: 'c', label: null }]);
  });

  it('keeps shown text in a table cell as a link when the pipe is escaped', () => {
    const out = roundTrip('| x | y |\n| --- | --- |\n| [[c\\|d]] | z |');
    expect(out).toContain('c');
    const ed = load(out);
    expect(linkNodes(ed).length).toBe(1);
    expect(roundTrip(out)).toBe(out);
  });
});
