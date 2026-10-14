const WORD = /[\p{L}\p{M}\p{N}]+/gu;

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** The words of a text: runs of letters, marks and digits (the same split as the server's). */
export const wordsOf = (text: string): string[] => text.toLowerCase().match(WORD) ?? [];

/**
 * How many characters of the original word cover `lowerLength` characters of its lower-case form.
 * Lower-casing can change a length ("İ" becomes two characters), so lengths are never reused.
 */
function originalLength(original: string, lowerLength: number): number {
  let covered = 0;
  let length = 0;
  for (const char of original) {
    if (covered >= lowerLength) break;
    covered += char.toLowerCase().length;
    length += char.length;
  }
  return length;
}

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
    const lowerLength = Math.max(
      0,
      ...typed.filter((t) => word.startsWith(t)).map((t) => t.length),
    );
    if (lowerLength === 0) continue;
    const length = originalLength(found[0], lowerLength);
    const start = found.index;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: text.slice(start, start + length), match: true });
    last = start + length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}
