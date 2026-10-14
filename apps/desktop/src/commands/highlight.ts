const WORD = /[\p{L}\p{M}\p{N}]+/gu;

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** The words of a text: runs of letters, marks and digits (the same split as the server's). */
export const wordsOf = (text: string): string[] => text.toLowerCase().match(WORD) ?? [];

/**
 * Splits text so the start of every word that begins with a typed word can be marked (search.md
 * D10). Case does not matter; punctuation and spaces are never part of a word.
 */
export function highlight(text: string, query: string): HighlightPart[] {
  const typed = wordsOf(query);
  if (typed.length === 0) return [{ text, match: false }];

  const parts: HighlightPart[] = [];
  let last = 0;
  for (const found of text.matchAll(WORD)) {
    const word = found[0].toLowerCase();
    const length = Math.max(0, ...typed.filter((t) => word.startsWith(t)).map((t) => t.length));
    if (length === 0) continue;
    const start = found.index;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: text.slice(start, start + length), match: true });
    last = start + length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}
