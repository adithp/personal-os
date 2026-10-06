import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export function readRepoFile(relativePath: string): string {
  return readFileSync(repoRoot + relativePath, 'utf8').replace(/\r\n/g, '\n');
}

/** Rows (cells, trimmed) of the markdown table whose header row starts with the given cells. */
export function markdownTable(markdown: string, headerStart: readonly string[]): string[][] {
  const lines = markdown.split('\n');
  const toCells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const headerIndex = lines.findIndex((line) => {
    if (!line.trim().startsWith('|')) return false;
    const cells = toCells(line);
    return headerStart.every((cell, i) => cells[i] === cell);
  });
  if (headerIndex === -1) throw new Error(`Table not found: ${headerStart.join(' | ')}`);

  const rows: string[][] = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break;
    rows.push(toCells(line));
  }
  return rows;
}

/** CSS custom properties per selector, e.g. { ":root,[data-theme='dark']": { "--bg": "#15171c" } }. */
export function cssVariablesBySelector(css: string): Map<string, Map<string, string>> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = new Map<string, Map<string, string>>();
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').replace(/\s+/g, '');
    const vars = new Map<string, string>();
    for (const declaration of (match[2] ?? '').split(';')) {
      const colon = declaration.indexOf(':');
      if (colon === -1) continue;
      const name = declaration.slice(0, colon).trim();
      if (name.startsWith('--')) vars.set(name, declaration.slice(colon + 1).trim());
    }
    blocks.set(selector, vars);
  }
  return blocks;
}

/** Lowercase and remove whitespace so "rgba(0, 0, 0, 0.07)" equals "rgba(0,0,0,0.07)". */
export function normalizeColor(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
