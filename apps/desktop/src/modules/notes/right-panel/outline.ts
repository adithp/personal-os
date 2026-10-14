export interface OutlineItem {
  /** 1 to 3. */
  level: 1 | 2 | 3;
  text: string;
  /** Position among the H1 to H3 headings of the note (what `jumpToHeading` takes). */
  index: number;
}

const HEADING = /^ {0,3}(#{1,3})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Plain text of a heading line: wikilinks show their label, emphasis marks and escapes go. */
function plain(text: string): string {
  return text
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\\(.)/g, '$1')
    .trim();
}

/** H1 to H3 headings of a markdown text, outside code blocks. Empty headings are left out. */
export function parseOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker.startsWith(fence.charAt(0)) && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    const text = plain(match[2] ?? '');
    if (text === '') continue;
    items.push({ level: (match[1] ?? '#').length as 1 | 2 | 3, text, index: items.length });
  }
  return items;
}
