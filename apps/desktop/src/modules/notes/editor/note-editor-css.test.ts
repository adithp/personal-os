// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = ['./note-editor.css', './slash-menu/suggestion-menu.css', './wikilink/wikilink.css'];

describe.each(FILES)('%s', (file) => {
  const css = readFileSync(new URL(file, import.meta.url), 'utf8');

  it('uses only tokens: no #rrggbb, rgb(, hsl( colors', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\brgba?\(/i);
    expect(css).not.toMatch(/\bhsla?\(/i);
  });

  it('draws borders 1 px wide (half pixels vanish on some screens)', () => {
    expect(css).not.toMatch(/0\.5px/);
  });
});
