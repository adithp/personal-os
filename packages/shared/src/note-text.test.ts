import { describe, expect, it } from 'vitest';
import {
  countWords,
  excerptOf,
  markdownToPlainText,
  parseWikilinks,
  rewriteWikilinks,
  unescapeMarkdown,
} from './note-text';

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

describe('parseWikilinks', () => {
  it('finds plain, aliased and heading links in order', () => {
    expect(parseWikilinks('a [[One]] b [[Two|second]] c [[Three#Part]] [[One]]')).toEqual([
      { target: 'One', label: null, heading: null },
      { target: 'Two', label: 'second', heading: null },
      { target: 'Three', label: null, heading: 'Part' },
      { target: 'One', label: null, heading: null },
    ]);
  });

  it('skips fenced and inline code and undoes escapes', () => {
    const md = '```\n[[in fence]]\n```\nuse `[[inline]]` and [[real\\_one]]';
    expect(parseWikilinks(md).map((link) => link.target)).toEqual(['real_one']);
  });

  it('ignores empty or broken brackets and handles Malayalam', () => {
    expect(parseWikilinks('[[ ]] [[a]b]] [[വാടക]]').map((link) => link.target)).toEqual(['വാടക']);
  });
});

describe('rewriteWikilinks', () => {
  it('renames every form ignoring case and keeps heading and label', () => {
    const md = '[[Old]] [[old|x]] [[OLD#h]] [[Other]]';
    expect(rewriteWikilinks(md, 'Old', 'New')).toBe('[[New]] [[New|x]] [[New#h]] [[Other]]');
  });

  it('leaves code alone', () => {
    const md = '`[[Old]]`\n```\n[[Old]]\n```\n[[Old]]';
    expect(rewriteWikilinks(md, 'old', 'New')).toBe('`[[Old]]`\n```\n[[Old]]\n```\n[[New]]');
  });
});

describe('code detection for wikilinks', () => {
  const targets = (md: string) => parseWikilinks(md).map((link) => link.target);

  it('closes a fence only with the same character and at least the same length', () => {
    expect(targets('```\n[[a]]\n~~~\n[[b]]\n```\n[[c]]')).toEqual(['c']);
    expect(targets('````\n[[a]]\n```\n[[b]]\n````\n[[c]]')).toEqual(['c']);
    expect(targets('~~~\n[[a]]\n```\n[[b]]\n~~~\n[[c]]')).toEqual(['c']);
  });

  it('does not close a fence on a line that has text after the marker', () => {
    expect(targets('```\n[[a]]\n``` not a close\n[[b]]\n```\n[[c]]')).toEqual(['c']);
  });

  it('treats fences inside blockquotes as fences', () => {
    expect(targets('> ```\n> [[a]]\n> ```\n[[b]]')).toEqual(['b']);
  });

  it('keeps an unclosed fence as code to the end', () => {
    expect(targets('[[a]]\n```\n[[b]]')).toEqual(['a']);
  });

  it('reads a backtick line with a backtick in the info string as inline code, not a fence', () => {
    expect(targets('```a`\n[[b]]')).toEqual(['b']);
  });

  it('matches inline code spans by the length of the backtick run', () => {
    expect(targets('``a ` [[x]] ``[[y]]')).toEqual(['y']);
    expect(targets('`[[x]]`` [[y]]')).toEqual(['x', 'y']);
  });

  it('rewrites only outside the code the same way', () => {
    const md = '> ~~~\n> [[Old]]\n> ~~~\n[[Old]]';
    expect(rewriteWikilinks(md, 'Old', 'New')).toBe('> ~~~\n> [[Old]]\n> ~~~\n[[New]]');
  });

  it('finds a link written with spaces inside the brackets', () => {
    expect(targets('[[ Title ]]')).toEqual(['Title']);
  });

  it('stays fast on lines of backticks and on very long lines', () => {
    const started = Date.now();
    expect(targets('`'.repeat(100_000))).toEqual([]);
    expect(targets('`a'.repeat(50_000))).toEqual([]);
    expect(targets(`${'``a`'.repeat(10_000)}[[x]]`)).toBeInstanceOf(Array);
    expect(targets(`${'x'.repeat(30_000)} [[late]]`)).toEqual(['late']);
    expect(targets('[['.repeat(50_000))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
