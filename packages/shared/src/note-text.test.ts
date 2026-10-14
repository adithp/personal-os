import { describe, expect, it } from 'vitest';
import {
  applyTemplate,
  countWords,
  excerptOf,
  indiaDay,
  LINE_DIFF_MAX_CELLS,
  lineDiff,
  markdownToPlainText,
  parseTags,
  parseWikilinks,
  rewriteTag,
  rewriteWikilinks,
  unescapeMarkdown,
  wordsDelta,
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

describe('parseTags', () => {
  it('finds tags after a space or at a line start, with letters, digits, _ - and /', () => {
    expect(parseTags('#one two #Two_b three #a-b/c\n#last')).toEqual([
      'one',
      'Two_b',
      'a-b/c',
      'last',
    ]);
  });

  it('keeps the first spelling and drops duplicates ignoring case', () => {
    expect(parseTags('#Work and #work and #WORK')).toEqual(['Work']);
  });

  it('needs a letter or underscore, so numbers and dates are not tags', () => {
    expect(parseTags('#1984 #2024-05 #y1984 #12/3 #1_')).toEqual(['y1984', '1_']);
  });

  it('ignores heading markers', () => {
    expect(parseTags('# Heading\n## Second\n### Third #real')).toEqual(['real']);
    expect(parseTags('#\n# ')).toEqual([]);
  });

  it('needs a space or a line start before the #', () => {
    expect(parseTags('a#b word#c (#d) "#e" x\t#f')).toEqual(['f']);
    expect(parseTags('##double ###triple')).toEqual([]);
  });

  it('ignores URL fragments, wikilink headings and markdown link targets', () => {
    expect(
      parseTags('see https://x.com/page#section and [[Note#Heading]] and [a](http://b/#c)'),
    ).toEqual([]);
    expect(parseTags('https://x.com/#top #ok')).toEqual(['ok']);
  });

  it('ignores tags in inline code and fenced code, and reads text after them', () => {
    expect(parseTags('`#a` #b ``x `#c` y`` #d')).toEqual(['b', 'd']);
    expect(parseTags('```\n#fenced\n```\n#after')).toEqual(['after']);
    expect(parseTags('~~~js\n#x\n~~~\n#y')).toEqual(['y']);
    expect(parseTags('`code`#glued')).toEqual([]);
    expect(parseTags('`code` #spaced')).toEqual(['spaced']);
  });

  it('undoes the \\_ escapes the editor writes', () => {
    expect(parseTags('#my\\_tag and #a\\-b')).toEqual(['my_tag', 'a-b']);
  });

  it('stops at punctuation and reads Malayalam and accented letters', () => {
    expect(parseTags('#done. #a,b #കേരളം #café!')).toEqual(['done', 'a', 'കേരളം', 'café']);
  });

  it('skips names longer than a tag name can be', () => {
    expect(parseTags(`#${'a'.repeat(41)} #${'b'.repeat(40)}`)).toEqual(['b'.repeat(40)]);
  });

  it('works on quotes, list items and a Windows line break', () => {
    expect(parseTags('> #quote\r\n- #item\r\n- [ ] #todo')).toEqual(['quote', 'item', 'todo']);
  });

  it('stays fast on adversarial text', () => {
    const started = Date.now();
    expect(parseTags('#'.repeat(100_000))).toEqual([]);
    expect(parseTags('# '.repeat(50_000))).toEqual([]);
    expect(parseTags(' #\\'.repeat(50_000))).toEqual([]);
    expect(parseTags('a'.repeat(200_000))).toEqual([]);
    expect(parseTags(`#${'a'.repeat(200_000)}`)).toEqual([]);
    expect(parseTags(`#${'\\_'.repeat(50_000)}`)).toEqual([]);
    expect(parseTags(' #1'.repeat(50_000))).toEqual([]);
    expect(parseTags('`'.repeat(100_000))).toEqual([]);
    expect(parseTags(`${'``a`'.repeat(10_000)} #end`)).toBeInstanceOf(Array);
    expect(parseTags(' #a'.repeat(20_000))).toEqual(['a']);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('rewriteTag', () => {
  it('renames a tag ignoring case and leaves other text and tags alone', () => {
    expect(rewriteTag('#Work and #work, #worker and #other', 'WORK', 'job')).toBe(
      '#job and #job, #worker and #other',
    );
  });

  it('renames only whole names, so #work/sub is a different tag', () => {
    expect(rewriteTag('#work/sub #work', 'work', 'job')).toBe('#work/sub #job');
  });

  it('does not touch code, URL fragments, headings or glued text', () => {
    const md = (last: string) =>
      ['`#work`', '```', '#work', '```', 'http://a/#work a#work', '# work', last].join('\n');
    expect(rewriteTag(md('#work'), 'work', 'job')).toBe(md('#job'));
  });

  it('matches a tag written with \\_ escapes and writes the new name as given', () => {
    expect(rewriteTag('#my\\_tag x', 'my_tag', 'New_Name')).toBe('#New_Name x');
  });

  it('returns the same text when the tag is not there', () => {
    expect(rewriteTag('nothing #else', 'work', 'job')).toBe('nothing #else');
    expect(rewriteTag('', 'work', 'job')).toBe('');
  });

  it('is not fooled by a replacement with $ characters', () => {
    expect(rewriteTag('#a', 'a', '$&$1')).toBe('#$&$1');
  });

  it('stays fast on adversarial text', () => {
    const started = Date.now();
    rewriteTag(' #a'.repeat(50_000), 'a', 'b');
    rewriteTag('#'.repeat(100_000), 'a', 'b');
    rewriteTag(`#${'a'.repeat(200_000)}`, 'a', 'b');
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('applyTemplate', () => {
  // 2026-10-13 20:00 UTC is 2026-10-14 01:30 in India
  const now = new Date('2026-10-13T20:00:00Z');

  it('fills title, date and time in India time', () => {
    expect(applyTemplate('# {{title}}\n{{date}} {{time}}', { title: 'Plan', now })).toBe(
      '# Plan\n2026-10-14 01:30',
    );
  });

  it('uses the India day just after midnight and just before it', () => {
    const t = (iso: string) =>
      applyTemplate('{{date}} {{time}}', { title: 'x', now: new Date(iso) });
    expect(t('2026-10-13T18:29:59Z')).toBe('2026-10-13 23:59');
    expect(t('2026-10-13T18:30:00Z')).toBe('2026-10-14 00:00');
    expect(t('2026-12-31T18:40:00Z')).toBe('2027-01-01 00:10');
  });

  it('allows spaces and any case inside the braces, and repeats', () => {
    expect(applyTemplate('{{ Title }} {{DATE}} {{title}}', { title: 'A', now })).toBe(
      'A 2026-10-14 A',
    );
  });

  it('leaves unknown variables and format strings alone', () => {
    expect(applyTemplate('{{date:YYYY}} {{name}} {title} {{ }}', { title: 'A', now })).toBe(
      '{{date:YYYY}} {{name}} {title} {{ }}',
    );
  });

  it('does not expand variables written in the title, or treat $ specially', () => {
    expect(applyTemplate('{{title}}', { title: '{{date}} $& $1', now })).toBe('{{date}} $& $1');
  });

  it('stays fast on adversarial text', () => {
    const started = Date.now();
    applyTemplate('{{'.repeat(100_000), { title: 'x', now });
    applyTemplate(`{{${' '.repeat(200_000)}`, { title: 'x', now });
    applyTemplate('{{ title'.repeat(50_000), { title: 'x', now });
    applyTemplate('{{ '.repeat(50_000), { title: 'x', now });
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('indiaDay', () => {
  it('is the India calendar day of an instant', () => {
    expect(indiaDay(new Date('2026-10-13T18:29:59Z'))).toBe('2026-10-13');
    expect(indiaDay(new Date('2026-10-13T18:30:00Z'))).toBe('2026-10-14');
  });
});

describe('lineDiff (stage N4)', () => {
  const same = (text: string) => ({ type: 'same', text });
  const add = (text: string) => ({ type: 'add', text });
  const remove = (text: string) => ({ type: 'remove', text });

  /** Rebuilds the old and the new text from a diff. */
  const sides = (diff: ReturnType<typeof lineDiff>) => ({
    old: diff.filter((d) => d.type !== 'add').map((d) => d.text),
    new: diff.filter((d) => d.type !== 'remove').map((d) => d.text),
  });

  it('is empty for two empty texts', () => {
    expect(lineDiff('', '')).toEqual([]);
  });

  it('adds every line when the old text is empty, removes every line when the new one is', () => {
    expect(lineDiff('', 'a\nb')).toEqual([add('a'), add('b')]);
    expect(lineDiff('a\nb', '')).toEqual([remove('a'), remove('b')]);
  });

  it('marks identical texts as all unchanged', () => {
    expect(lineDiff('a\nb\nc', 'a\nb\nc')).toEqual([same('a'), same('b'), same('c')]);
  });

  it('marks fully different texts as removed then added', () => {
    expect(lineDiff('a\nb', 'x\ny\nz')).toEqual([
      remove('a'),
      remove('b'),
      add('x'),
      add('y'),
      add('z'),
    ]);
  });

  it('finds an added, a removed and a changed line in the middle', () => {
    expect(lineDiff('a\nb\nc', 'a\nb\nx\nc')).toEqual([same('a'), same('b'), add('x'), same('c')]);
    expect(lineDiff('a\nb\nc', 'a\nc')).toEqual([same('a'), remove('b'), same('c')]);
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual([same('a'), remove('b'), add('B'), same('c')]);
  });

  it('keeps unchanged lines between changes (a real LCS, not just a trim)', () => {
    const diff = lineDiff('1\n2\n3\n4\n5', '2\n3\nx\n5\n6');
    expect(diff.filter((d) => d.type === 'same').map((d) => d.text)).toEqual(['2', '3', '5']);
    expect(sides(diff)).toEqual({ old: ['1', '2', '3', '4', '5'], new: ['2', '3', 'x', '5', '6'] });
  });

  it('treats a blank line as a line, and \\r\\n like \\n', () => {
    expect(lineDiff('a\n\nb', 'a\nb')).toEqual([same('a'), remove(''), same('b')]);
    expect(lineDiff('a\r\nb', 'a\nb')).toEqual([same('a'), same('b')]);
  });

  it('handles repeated lines', () => {
    const diff = lineDiff('a\na\na', 'a\na');
    expect(diff.filter((d) => d.type === 'same')).toHaveLength(2);
    expect(diff.filter((d) => d.type === 'remove')).toHaveLength(1);
  });

  it('diffs a few thousand lines exactly', () => {
    const old = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
    const next = [...old];
    next.splice(1500, 1);
    next.splice(100, 0, 'new line');
    next[2000] = 'changed';
    const diff = lineDiff(old.join('\n'), next.join('\n'));
    expect(sides(diff)).toEqual({ old, new: next });
    expect(diff.filter((d) => d.type === 'add').map((d) => d.text)).toEqual([
      'new line',
      'changed',
    ]);
    expect(diff.filter((d) => d.type === 'remove')).toHaveLength(2);
  });

  it('falls back to a coarse diff on huge inputs, still keeping the shared start and end', () => {
    const size = Math.ceil(Math.sqrt(LINE_DIFF_MAX_CELLS)) + 50;
    const middleA = Array.from({ length: size }, (_, i) => `a${i}`);
    const middleB = Array.from({ length: size }, (_, i) => `b${i}`);
    const diff = lineDiff(
      ['top', ...middleA, 'bottom'].join('\n'),
      ['top', ...middleB, 'bottom'].join('\n'),
    );
    expect(diff[0]).toEqual(same('top'));
    expect(diff[diff.length - 1]).toEqual(same('bottom'));
    expect(diff.filter((d) => d.type === 'remove')).toHaveLength(size);
    expect(diff.filter((d) => d.type === 'add')).toHaveLength(size);
    // Removed lines come before added lines
    expect(diff[1]?.type).toBe('remove');
    expect(diff[size + 1]?.type).toBe('add');
  });
});

describe('wordsDelta', () => {
  it('is the new word count minus the old one', () => {
    expect(wordsDelta('', 'one two three')).toBe(3);
    expect(wordsDelta('one two three', 'one')).toBe(-2);
    expect(wordsDelta('same words', 'same words')).toBe(0);
    expect(wordsDelta('', '')).toBe(0);
  });
});
