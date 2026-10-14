import { TAG_NAME_MAX } from './tags';

/**
 * Pure text helpers for notes (research memo docs/design/research/notes.md D1, D9, §4). The server
 * uses them on every save (plain text for search and list excerpts); the app uses countWords.
 * Notes are stored as Markdown; these functions read it with small rules and no editor.
 */

/** Undoes backslash escapes of Markdown punctuation and the three HTML entities the editor writes. */
export function unescapeMarkdown(text: string): string {
  return text
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Longest line read; the rest of a longer line is dropped so the patterns below stay fast. */
const LINE_MAX = 4000;

/**
 * Plain text of a Markdown document: no markers, links shown by their text, wikilinks shown by
 * their label (or title), code kept as text, one line per block, blank lines dropped.
 */
export function markdownToPlainText(markdown: string): string {
  const lines: string[] = [];
  let inFence = false;
  for (const full of markdown.split(/\r?\n/)) {
    const raw = full.length > LINE_MAX ? full.slice(0, LINE_MAX) : full;
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (raw.trim()) lines.push(raw.trim());
      continue;
    }
    let line = raw
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>+\s?/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, '')
      .replace(/^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*$/, '');
    line = line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^[\]|\n]+)\|([^[\]\n]+)\]\]/g, '$2')
      .replace(/\[\[([^[\]|\n]+)\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(`+)([^`]*)\1/g, '$2')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/\s*\|\s*/g, ' ');
    line = unescapeMarkdown(line).replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

/** Words in a text: runs of letters, marks and digits (so Malayalam counts too). */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{M}\p{N}]+/gu)?.length ?? 0;
}

/** A short single-line excerpt of a plain text, cut at a word boundary where it can. */
export function excerptOf(plainText: string, max = 140): string {
  const flat = plainText.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// ---- wikilinks (stage N2, memo notes.md D6, D8, D9) ----

export interface Wikilink {
  /** The note title as written, without a heading part. */
  target: string;
  /** The text after `|`, if any. */
  label: string | null;
  /** The part after `#` in `[[Note#Heading]]`, if any. */
  heading: string | null;
}

const WIKILINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

/** Longest stretch of a line searched for inline code; the rest of a longer line is plain text. */
const CODE_SCAN_MAX = 20000;

interface Fence {
  char: string;
  length: number;
  /** What follows the run of fence characters. */
  rest: string;
}

/** A fence marker at the start of a line, also after spaces and blockquote `>` marks. */
function fenceOf(line: string): Fence | null {
  let start = 0;
  while (
    start < line.length &&
    (line[start] === ' ' || line[start] === '\t' || line[start] === '>')
  )
    start += 1;
  const char = line[start];
  if (char !== '`' && char !== '~') return null;
  let end = start;
  while (line[end] === char) end += 1;
  if (end - start < 3) return null;
  return { char, length: end - start, rest: line.slice(end, end + CODE_SCAN_MAX) };
}

/**
 * Inline code spans of a line as [start, end) ranges: a run of N backticks up to the next run of
 * exactly N backticks. One pass over the runs, so it stays fast on lines of backticks.
 */
function inlineCodeRanges(line: string): [number, number][] {
  const runs: { start: number; length: number }[] = [];
  for (let index = 0; index < line.length;) {
    if (line[index] !== '`') {
      index += 1;
      continue;
    }
    const start = index;
    while (line[index] === '`') index += 1;
    runs.push({ start, length: index - start });
  }
  const ranges: [number, number][] = [];
  for (let open = 0; open < runs.length; open += 1) {
    const opener = runs[open];
    if (!opener) break;
    let close = open + 1;
    while (close < runs.length && runs[close]?.length !== opener.length) close += 1;
    const closer = runs[close];
    if (!closer) continue;
    ranges.push([opener.start, closer.start + closer.length]);
    open = close;
  }
  return ranges;
}

/** Splits a document into pieces that are code (fenced blocks, inline code) or normal text. */
function splitCode(markdown: string): { text: string; code: boolean }[] {
  const parts: { text: string; code: boolean }[] = [];
  let fence: Fence | null = null;
  let buffer = '';
  const flush = (code: boolean) => {
    if (buffer) parts.push({ text: buffer, code });
    buffer = '';
  };
  const lines = markdown.split('\n');
  for (const [index, line] of lines.entries()) {
    const withBreak = index < lines.length - 1 ? `${line}\n` : line;
    const marker = fenceOf(line);
    if (fence) {
      buffer += withBreak;
      if (
        marker?.char === fence.char &&
        marker.length >= fence.length &&
        marker.rest.trim() === ''
      ) {
        fence = null;
        flush(true);
      }
      continue;
    }
    // A backtick fence cannot have a backtick in its info string (then it is inline code)
    if (marker && !(marker.char === '`' && marker.rest.includes('`'))) {
      flush(false);
      buffer += withBreak;
      fence = marker;
      continue;
    }
    // Inline code spans inside a normal line
    const scanned = line.slice(0, CODE_SCAN_MAX);
    let at = 0;
    for (const [from, to] of inlineCodeRanges(scanned)) {
      buffer += withBreak.slice(at, from);
      flush(false);
      parts.push({ text: withBreak.slice(from, to), code: true });
      at = to;
    }
    buffer += withBreak.slice(at);
  }
  flush(fence !== null);
  return parts;
}

function readLink(rawTarget: string, rawLabel: string | undefined): Wikilink | null {
  const inner = unescapeMarkdown(rawTarget);
  const hash = inner.indexOf('#');
  const target = (hash === -1 ? inner : inner.slice(0, hash)).trim();
  if (!target) return null;
  const heading = hash === -1 ? null : inner.slice(hash + 1).trim() || null;
  const label = rawLabel ? unescapeMarkdown(rawLabel).trim() || null : null;
  return { target, label, heading };
}

/** Every wikilink outside code, in order (duplicates kept). Backslash escapes are undone. */
export function parseWikilinks(markdown: string): Wikilink[] {
  const found: Wikilink[] = [];
  for (const part of splitCode(markdown)) {
    if (part.code) continue;
    for (const match of part.text.matchAll(WIKILINK)) {
      const link = readLink(match[1] ?? '', match[2]);
      if (link) found.push(link);
    }
  }
  return found;
}

/** Rewrites links to `oldTitle` (ignoring case, outside code) so they point to `newTitle`; keeps `#heading` and `|label`. */
export function rewriteWikilinks(markdown: string, oldTitle: string, newTitle: string): string {
  const wanted = oldTitle.trim().toLowerCase();
  return splitCode(markdown)
    .map((part) =>
      part.code
        ? part.text
        : part.text.replace(WIKILINK, (whole, rawTarget: string, rawLabel?: string) => {
            const link = readLink(rawTarget, rawLabel);
            if (link?.target.toLowerCase() !== wanted) return whole;
            const heading = link.heading ? `#${link.heading}` : '';
            return `[[${newTitle}${heading}${rawLabel ? `|${rawLabel}` : ''}]]`;
          }),
    )
    .join('');
}

// ---- tags in notes (stage N3, memo notes.md D10) ----

/** `#name` where the name is letters, digits, `_`, `-`, `/` (and `\_` or `\-`, which the editor writes). */
const TAG = /#((?:\\[_-]|[\p{L}\p{M}\p{N}_\-/])+)/gu;

/** Can the note parser read `#name` as a tag? Letters, digits, `_`, `-`, `/` only, with a letter or `_`. */
export function isNoteTagName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= TAG_NAME_MAX &&
    /^[\p{L}\p{M}\p{N}_\-/]+$/u.test(name) &&
    /[\p{L}\p{M}_]/u.test(name)
  );
}

/**
 * Visits every tag in a note and rebuilds the text with what `visit` returns for it (undefined keeps
 * the tag). A tag follows a space or a line start (so URL fragments and `a#b` are not tags), is not
 * in code, is not a heading marker (`# ` has a space), and has a letter or `_` (not only digits,
 * `-` and `/`, so `#1984` and `#2024-05-01` are not tags).
 */
function mapTags(markdown: string, visit: (name: string) => string | undefined): string {
  let previous = '\n';
  let out = '';
  for (const part of splitCode(markdown)) {
    if (part.code) {
      out += part.text;
      previous = part.text.endsWith('\n') ? '\n' : '`';
      continue;
    }
    out += part.text.replace(TAG, (whole: string, raw: string, offset: number) => {
      const before = offset === 0 ? previous : (part.text[offset - 1] ?? '');
      if (!/\s/.test(before)) return whole;
      const name = raw.replace(/\\([_-])/g, '$1');
      if (!isNoteTagName(name)) return whole;
      return visit(name) ?? whole;
    });
    previous = part.text.slice(-1) || previous;
  }
  return out;
}

/** The unique tag names of a note (first spelling wins, compared ignoring case), in order of appearance. */
export function parseTags(markdown: string): string[] {
  const seen = new Map<string, string>();
  mapTags(markdown, (name) => {
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
    return undefined;
  });
  return [...seen.values()];
}

/** Rewrites `#oldName` (ignoring case, outside code, whole name only) to `#newName`; the rest is untouched. */
export function rewriteTag(markdown: string, oldName: string, newName: string): string {
  const wanted = oldName.trim().toLowerCase();
  return mapTags(markdown, (name) => (name.toLowerCase() === wanted ? `#${newName}` : undefined));
}

// ---- templates and daily notes (stage N3, memo notes.md D11, D12) ----

const INDIA_TIME_ZONE = 'Asia/Kolkata';
const TEMPLATE_VARIABLE = /\{\{[ \t]{0,10}(title|date|time)[ \t]{0,10}\}\}/gi;

/** Date and time in India as YYYY-MM-DD and HH:mm. */
function indiaDateTime(now: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/** The India calendar day of an instant, as YYYY-MM-DD (the date of a daily note). */
export function indiaDay(now: Date): string {
  return indiaDateTime(now).date;
}

/**
 * Fills `{{title}}`, `{{date}}` (YYYY-MM-DD) and `{{time}}` (HH:mm), India time, in one pass.
 * `date` (an India day) replaces today's date, for a daily note of another day; the time stays now.
 */
export function applyTemplate(
  markdown: string,
  context: { title: string; now: Date; date?: string },
): string {
  const { date: today, time } = indiaDateTime(context.now);
  const date = context.date ?? today;
  return markdown.replace(TEMPLATE_VARIABLE, (_whole, variable: string) => {
    const name = variable.toLowerCase();
    return name === 'title' ? context.title : name === 'date' ? date : time;
  });
}
