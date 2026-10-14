import { InputRule, mergeAttributes, type Editor } from '@tiptap/core';
import { Mention } from '@tiptap/extension-mention';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Suggestion, findSuggestionMatch } from '@tiptap/suggestion';
import { createMenuRenderer, MENU_FLOATING } from '../slash-menu/suggestion-menu';
import './wikilink.css';

export interface NoteTitle {
  id: string;
  title: string;
  /** `title` in lower case, worked out once by the caller (it is compared on every key). */
  lower?: string;
}

/** The answer of `resolve` while the titles are not loaded yet: the link is neither found nor missing. */
export const LINK_UNKNOWN = 'unknown';

export interface WikiLinkOptions {
  /**
   * The id of the live note with this title (ignoring case), null when there is none, or
   * `LINK_UNKNOWN` while the titles are still loading.
   */
  resolve: (title: string) => string | null;
  /** The titles offered after typing `[[`. Called on every key, so it must be cheap. */
  getTitles: () => NoteTitle[];
  /** A click (or Enter on the selected link) on a link; `title` has any `#heading` removed. */
  onOpen: (title: string) => void;
}

type WikiItem = { kind: 'note'; id: string; title: string } | { kind: 'create'; title: string };

const MAX_NOTES = 8;
/** The text form (research memo notes.md D6). Titles cannot contain [ ] | so this is unambiguous. */
const TOKEN = /^\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/;
const TYPED = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]$/;

export const wikiLinkSuggestionKey = new PluginKey('wikiLinkSuggestion');
const wikiLinkStateKey = new PluginKey<DecorationSet>('wikiLinkState');

/** `Note#Heading` points to the note `Note`. */
export function titleOf(target: string): string {
  return (target.split('#')[0] ?? '').trim();
}

/** Looks at every link again (call after the note titles changed). */
export function refreshWikilinks(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(wikiLinkStateKey, 'refresh'));
}

function pickItems(titles: NoteTitle[], query: string): WikiItem[] {
  const typed = query.trim();
  // `Note#Heading` is compared by its note part
  const needle = titleOf(typed).toLowerCase();
  const lower = (note: NoteTitle) => note.lower ?? note.title.toLowerCase();
  const found = titles
    .filter((note) => lower(note).includes(needle))
    .sort((a, b) => Number(lower(b).startsWith(needle)) - Number(lower(a).startsWith(needle)))
    .slice(0, MAX_NOTES)
    .map((note): WikiItem => ({ kind: 'note', id: note.id, title: note.title }));
  const exact = titles.some((note) => lower(note) === needle);
  return needle && !exact ? [...found, { kind: 'create', title: typed }] : found;
}

/**
 * `[[Note]]` and `[[Note|shown text]]` as an inline atom node (research memo notes.md D6). Built on
 * Mention for the node shape only; the suggestion, the Markdown rules and the keys are our own. It
 * is drawn with plain HTML: a peach underline when the title resolves, a dashed muted one when it
 * does not (the class comes from a decoration, so it follows `resolve` without redrawing the node).
 */
export const WikiLink = Mention.extend<WikiLinkOptions>({
  name: 'wikiLink',
  selectable: true,

  addOptions() {
    return { resolve: () => null, getTitles: () => [], onOpen: () => undefined };
  },

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-target') ?? '',
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wikiLink"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = String(node.attrs.target);
    const label = node.attrs.label ? String(node.attrs.label) : null;
    return [
      'span',
      mergeAttributes(
        { 'data-type': 'wikiLink', class: 'wikilink', 'data-target': target },
        label ? { 'data-label': label } : {},
        HTMLAttributes,
      ),
      label ?? target,
    ];
  },

  renderText({ node }) {
    return String(node.attrs.label ?? node.attrs.target);
  },

  markdownTokenName: 'wikiLink',
  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start: (src: string) => src.indexOf('[['),
    tokenize(src: string) {
      const match = TOKEN.exec(src);
      if (!match) return undefined;
      return {
        type: 'wikiLink',
        raw: match[0],
        target: (match[1] ?? '').trim(),
        label: match[2]?.trim() ?? '',
      };
    },
  },
  parseMarkdown(token, helpers) {
    const label = typeof token.label === 'string' && token.label ? token.label : null;
    return helpers.createNode('wikiLink', { target: String(token.target ?? ''), label });
  },
  renderMarkdown(node) {
    const target = String(node.attrs?.target ?? '');
    const label = node.attrs?.label ? `|${String(node.attrs.label)}` : '';
    return `[[${target}${label}]]`;
  },

  // Backspace deletes the whole link (Mention would turn it back into the trigger text)
  addKeyboardShortcuts() {
    return {};
  },

  // Typing a whole `[[Note]]` by hand also makes a link
  addInputRules() {
    return [
      new InputRule({
        find: TYPED,
        handler: ({ state, range, match }) => {
          const label = match[2]?.trim();
          const attrs = {
            target: (match[1] ?? '').trim(),
            label: label === '' ? null : (label ?? null),
          };
          state.tr.replaceWith(range.from, range.to, this.type.create(attrs));
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { resolve, getTitles, onOpen } = this.options;
    const name = this.name;

    const styled = (doc: Parameters<typeof DecorationSet.create>[0]) => {
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== name) return;
        const found = resolve(titleOf(String(node.attrs.target)));
        if (found === LINK_UNKNOWN) return;
        const shown = String(node.attrs.label ?? node.attrs.target);
        decorations.push(
          Decoration.node(
            pos,
            pos + node.nodeSize,
            found !== null
              ? { class: 'wikilink-resolved' }
              : {
                  class: 'wikilink-unresolved',
                  role: 'link',
                  'aria-label': `${shown}, not created yet`,
                  title: 'Not created yet. Click to create it.',
                },
          ),
        );
      });
      return DecorationSet.create(doc, decorations);
    };

    const links = new Plugin<DecorationSet>({
      key: wikiLinkStateKey,
      state: {
        init: (_, state) => styled(state.doc),
        apply: (tr, set, _old, state) =>
          tr.docChanged || tr.getMeta(wikiLinkStateKey) ? styled(state.doc) : set,
      },
      props: {
        decorations: (state) => wikiLinkStateKey.getState(state),
        handleDOMEvents: {
          click: (view, event) => {
            if (!view.editable) return false;
            const link =
              event.target instanceof Element
                ? event.target.closest<HTMLElement>('[data-type="wikiLink"]')
                : null;
            if (!link) return false;
            const title = titleOf(link.dataset.target ?? '');
            if (!title) return false;
            onOpen(title);
            return true;
          },
        },
        handleKeyDown: (view, event) => {
          const { selection } = view.state;
          if (
            event.key !== 'Enter' ||
            event.isComposing ||
            !view.editable ||
            !(selection instanceof NodeSelection) ||
            selection.node.type.name !== name
          ) {
            return false;
          }
          const title = titleOf(String(selection.node.attrs.target));
          if (!title) return false;
          onOpen(title);
          return true;
        },
      },
    });

    const suggestion = Suggestion<WikiItem, WikiItem>({
      editor: this.editor,
      pluginKey: wikiLinkSuggestionKey,
      char: '[[',
      allowSpaces: true,
      allowedPrefixes: null,
      flip: false,
      floatingUi: MENU_FLOATING,
      // A `]` ends the link, `[` or `|` start something else: the menu closes in all three cases
      findSuggestionMatch: (config) => {
        const match = findSuggestionMatch(config);
        return match && /[[\]|]/.test(match.query) ? null : match;
      },
      allow: ({ state, range }) => {
        const $from = state.doc.resolve(range.from);
        return (
          !$from.parent.type.spec.code &&
          !$from.marks().some((mark) => mark.type.name === 'code') &&
          $from.parent.canReplaceWith($from.index(), $from.index(), this.type)
        );
      },
      items: ({ query }) => pickItems(getTitles(), query),
      command: ({ editor, range, props }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, { type: name, attrs: { target: props.title, label: null } })
          .run();
      },
      render: createMenuRenderer<WikiItem>({
        pluginKey: wikiLinkSuggestionKey,
        label: 'Link to a note',
        row: (item) => ({ text: item.kind === 'create' ? `Create "${item.title}"` : item.title }),
      }),
    });

    return [links, suggestion];
  },
});
