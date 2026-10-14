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
