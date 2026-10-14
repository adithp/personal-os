import { describe, expect, it } from 'vitest';
import { countWords, excerptOf, markdownToPlainText, unescapeMarkdown } from './note-text';

describe('unescapeMarkdown', () => {
  it('undoes escapes and the three entities', () => {
    expect(unescapeMarkdown('a\\_b \\[x\\] &lt;p&gt; &amp; \\\\')).toBe('a_b [x] <p> & \\');
  });
});

describe('markdownToPlainText', () => {
  it('removes headings, emphasis, list and quote markers and checkboxes', () => {
    const md = '# Title\n\n**bold** and *italic*\n\n- [ ] todo\n- [x] done\n1. one\n> quoted';
    expect(markdownToPlainText(md)).toBe('Title\nbold and italic\ntodo\ndone\none\nquoted');
  });

  it('shows links and wikilinks by their text', () => {
    expect(markdownToPlainText('see [site](https://x.y) and [[Note A]] and [[Note B|the b]]')).toBe(
      'see site and Note A and the b',
    );
  });

  it('keeps the text of code blocks and inline code, and drops the fences', () => {
    expect(markdownToPlainText('```ts\nconst a = [[1]];\n```\nuse `npm i`')).toBe(
      'const a = [[1]];\nuse npm i',
    );
  });

  it('drops table separators and pipes', () => {
    expect(markdownToPlainText('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe('a b\n1 2');
  });

  it('handles Malayalam and empty input', () => {
    expect(markdownToPlainText('## വാടക\n\nപണം **അടയ്ക്കുക**')).toBe('വാടക\nപണം അടയ്ക്കുക');
    expect(markdownToPlainText('')).toBe('');
  });
});

describe('countWords', () => {
  it('counts letter and digit runs in any language', () => {
    expect(countWords('Pay rent, 2 days — വാടക അടയ്ക്കുക')).toBe(6);
    expect(countWords('')).toBe(0);
  });
});

describe('excerptOf', () => {
  it('keeps short text and cuts long text at a word', () => {
    expect(excerptOf('short text')).toBe('short text');
    const long = 'word '.repeat(60);
    const out = excerptOf(long, 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});

describe('markdownToPlainText on hostile input', () => {
  it('reads a 200,000 character line of markers quickly and keeps only the first part', () => {
    const line = '[*_` '.repeat(40_000);
    const out = markdownToPlainText(line);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out.startsWith('[')).toBe(true);
  });
});
