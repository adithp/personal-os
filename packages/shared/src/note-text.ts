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

/** Splits a document into pieces that are code (fenced blocks, inline code) or normal text. */
function splitCode(markdown: string): { text: string; code: boolean }[] {
  const parts: { text: string; code: boolean }[] = [];
  let inFence = false;
  let buffer = '';
  const flush = (code: boolean) => {
    if (buffer) parts.push({ text: buffer, code });
    buffer = '';
  };
  const lines = markdown.split('\n');
  lines.forEach((line, index) => {
    const withBreak = index < lines.length - 1 ? `${line}\n` : line;
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) flush(false);
      buffer += withBreak;
      inFence = !inFence;
      if (!inFence) flush(true);
      return;
    }
    if (inFence) {
      buffer += withBreak;
      return;
    }
    // Inline code spans inside a normal line
    const pieces = withBreak.split(/(`+[^`]*`+)/);
    for (const piece of pieces) {
      if (/^`+[^`]*`+$/.test(piece)) {
        flush(false);
        parts.push({ text: piece, code: true });
      } else buffer += piece;
    }
  });
  flush(inFence);
  return parts;
}

function readLink(match: RegExpExecArray): Wikilink | null {
  const inner = unescapeMarkdown(match[1] ?? '');
  const hash = inner.indexOf('#');
  const target = (hash === -1 ? inner : inner.slice(0, hash)).trim();
  if (!target) return null;
  const heading = hash === -1 ? null : inner.slice(hash + 1).trim() || null;
  const label = match[2] ? unescapeMarkdown(match[2]).trim() || null : null;
  return { target, label, heading };
}

/** Every wikilink outside code, in order (duplicates kept). Backslash escapes are undone. */
export function parseWikilinks(markdown: string): Wikilink[] {
  const found: Wikilink[] = [];
  for (const part of splitCode(markdown)) {
    if (part.code) continue;
    for (const match of part.text.matchAll(WIKILINK)) {
      const link = readLink(match);
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
            const link = readLink([whole, rawTarget, rawLabel] as unknown as RegExpExecArray);
            if (link?.target.toLowerCase() !== wanted) return whole;
            const heading = link.heading ? `#${link.heading}` : '';
            return `[[${newTitle}${heading}${rawLabel ? `|${rawLabel}` : ''}]]`;
          }),
    )
    .join('');
}
