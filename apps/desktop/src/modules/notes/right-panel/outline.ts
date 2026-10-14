import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

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

/** A heading of the live editor document: an outline item and where it sits in the document. */
export interface DocHeading extends OutlineItem {
  /** Position of the heading node in the document. */
  pos: number;
}

/**
 * The one counting rule for the Outline tab and the jump: H1 to H3 headings in document order, and
 * a heading counts when its shown text (text, plus the label or target of a wikilink) is not
 * blank. The list and `registerHeadingJump` both use this, so index i is the same heading in both.
 */
export function headingsOf(doc: ProseMirrorNode): DocHeading[] {
  const found: DocHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true;
    const level = Number(node.attrs.level);
    let text = '';
    node.descendants((child) => {
      if (child.isText) text += child.text ?? '';
      else if (child.type.name === 'wikiLink') {
        text += String(child.attrs.label ?? child.attrs.target ?? '');
      }
      return true;
    });
    text = text.trim();
    if (text !== '' && level >= 1 && level <= 3) {
      found.push({ level: level as 1 | 2 | 3, text, index: found.length, pos });
    }
    return false;
  });
  return found;
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
