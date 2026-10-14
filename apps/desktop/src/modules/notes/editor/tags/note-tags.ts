import { TAG_NAME_MAX } from '@personal-os/shared';
import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Suggestion, findSuggestionMatch } from '@tiptap/suggestion';
import { createMenuRenderer, MENU_FLOATING } from '../slash-menu/suggestion-menu';
import './note-tags.css';

export interface NoteTagInfo {
  name: string;
  /** `#RRGGBB` as the API sends it. */
  color: string;
}

export interface NoteTagOptions {
  /** The tags that exist (for the colors and the `#` menu). Called on every key, so it must be cheap. */
  getTags: () => NoteTagInfo[];
}

export const noteTagSuggestionKey = new PluginKey('noteTagSuggestion');
const noteTagStateKey = new PluginKey<DecorationSet>('noteTagState');

const MAX_ITEMS = 8;
/** Same characters as the server's rule (shared parseTags): letters, digits, `_`, `-`, `/`. */
const TAG = /#([\p{L}\p{M}\p{N}_\-/]+)/gu;
const TAG_CHARS = /^[\p{L}\p{M}\p{N}_\-/]*$/u;
const HEX = /^#[0-9a-f]{6}$/i;
/** Stands in for anything that is not plain text (code, links to notes) so a tag cannot start after it. */
const OBJECT = '￼';

/** The text of a block as the tag rule sees it: code is blanked and a hard break is a line start. */
function blockText(block: ProseNode) {
  let text = '';
  block.forEach((child) => {
    if (child.isText) {
      const raw = child.text ?? '';
      text += child.marks.some((mark) => mark.type.name === 'code')
        ? OBJECT.repeat(raw.length)
        : raw;
    } else {
      text += child.type.name === 'hardBreak' ? '\n' : OBJECT;
    }
  });
  return text;
}

/**
 * The tags written in a document: their place (document positions) and name. Follows the server
 * rule (shared parseTags): a tag follows a space or the start of a line, is not in code, and has a
 * letter or `_` in it (so `#1984` is not a tag).
 */
export function findTags(doc: ProseNode) {
  const found: { from: number; to: number; name: string }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isTextblock) return true;
    const text = blockText(node);
    for (const match of text.matchAll(TAG)) {
      const name = match[1] ?? '';
      const at = match.index;
      const before = at === 0 ? '\n' : (text[at - 1] ?? '');
      if (!/\s/.test(before)) continue;
      if (name.length > TAG_NAME_MAX || !/[\p{L}\p{M}_]/u.test(name)) continue;
      // `pos + 1` is the start of the block's content
      found.push({ from: pos + 1 + at, to: pos + 1 + at + match[0].length, name });
    }
    return false;
  });
  return found;
}

function styled(doc: ProseNode, getTags: () => NoteTagInfo[]): DecorationSet {
  const colors = new Map(getTags().map((tag) => [tag.name.toLowerCase(), tag.color]));
  return DecorationSet.create(
    doc,
    findTags(doc).map(({ from, to, name }) => {
      const color = colors.get(name.toLowerCase());
      return Decoration.inline(from, to, {
        class: 'note-tag',
        'data-tag': name,
        // A color that is not #RRGGBB is never put in a style
        ...(color && HEX.test(color) ? { style: `--tag-color: ${color}` } : {}),
      });
    }),
  );
}

/** Looks at every tag again (call after the list of tags changed). */
export function refreshNoteTags(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(noteTagStateKey, 'refresh'));
}

/** The tags that fit the typed text: names that start with it first, at most 8. */
export function pickTags(tags: NoteTagInfo[], query: string): NoteTagInfo[] {
  const needle = query.toLowerCase();
  return tags
    .filter((tag) => tag.name.toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(needle)) -
          Number(a.name.toLowerCase().startsWith(needle)) || a.name.localeCompare(b.name),
    )
    .slice(0, MAX_ITEMS);
}

/**
 * `#tag` in the text (research memo notes.md D10). The text stays plain text; a decoration draws it
 * as a soft chip in the tag's color (peach while the tag is new), and typing `#` suggests the tags
 * that exist. The server reads the tags from the saved text.
 */
export const NoteTags = Extension.create<NoteTagOptions>({
  name: 'noteTags',

  addOptions() {
    return { getTags: () => [] };
  },

  addProseMirrorPlugins() {
    const { getTags } = this.options;

    const chips = new Plugin<DecorationSet>({
      key: noteTagStateKey,
      state: {
        init: (_, state) => styled(state.doc, getTags),
        apply: (tr, set, _old, state) =>
          tr.docChanged || tr.getMeta(noteTagStateKey) ? styled(state.doc, getTags) : set,
      },
      props: { decorations: (state) => noteTagStateKey.getState(state) },
    });

    const suggestion = Suggestion<NoteTagInfo, NoteTagInfo>({
      editor: this.editor,
      pluginKey: noteTagSuggestionKey,
      char: '#',
      allowedPrefixes: [' '],
      flip: false,
      floatingUi: MENU_FLOATING,
      // Characters that cannot be in a tag close the menu
      findSuggestionMatch: (config) => {
        const match = findSuggestionMatch(config);
        return match && TAG_CHARS.test(match.query) ? match : null;
      },
      allow: ({ state, range }) => {
        const $from = state.doc.resolve(range.from);
        return !$from.parent.type.spec.code && !$from.marks().some((m) => m.type.name === 'code');
      },
      items: ({ query }) => pickTags(getTags(), query),
      command: ({ editor, range, props }) => {
        editor.chain().focus().insertContentAt(range, `#${props.name} `).run();
      },
      render: createMenuRenderer<NoteTagInfo>({
        pluginKey: noteTagSuggestionKey,
        label: 'Insert a tag',
        row: (tag) => ({ text: `#${tag.name}` }),
      }),
    });

    return [chips, suggestion];
  },
});
