import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import { createMenuRenderer, MENU_FLOATING } from './suggestion-menu';

export interface SlashItem {
  title: string;
  /** Extra words that also find the item. */
  keywords: string;
  hint?: string;
  /** `only` items show inside a table, `never` items everywhere except inside one. */
  table?: 'only' | 'never';
  run: (editor: Editor, range: Range) => void;
}

/** The chain after the typed `/query` is removed. */
const start = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Heading 1',
    keywords: 'h1 title',
    hint: '#',
    run: (e, r) => start(e, r).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    keywords: 'h2 subtitle',
    hint: '##',
    run: (e, r) => start(e, r).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    keywords: 'h3',
    hint: '###',
    run: (e, r) => start(e, r).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    keywords: 'unordered ul',
    hint: '-',
    run: (e, r) => start(e, r).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    keywords: 'ordered ol',
    hint: '1.',
    run: (e, r) => start(e, r).toggleOrderedList().run(),
  },
  {
    title: 'Checklist',
    keywords: 'todo task checkbox',
    hint: '[ ]',
    run: (e, r) => start(e, r).toggleTaskList().run(),
  },
  {
    title: 'Quote',
    keywords: 'blockquote',
    hint: '>',
    run: (e, r) => start(e, r).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    keywords: 'code snippet',
    hint: '```',
    run: (e, r) => start(e, r).toggleCodeBlock().run(),
  },
  {
    title: 'Table',
    keywords: 'grid',
    table: 'never',
    run: (e, r) => start(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: 'Divider',
    keywords: 'rule line hr',
    hint: '---',
    run: (e, r) => start(e, r).setHorizontalRule().run(),
  },
  {
    title: 'Add row',
    keywords: 'table below',
    table: 'only',
    run: (e, r) => start(e, r).addRowAfter().run(),
  },
  {
    title: 'Add column',
    keywords: 'table right',
    table: 'only',
    run: (e, r) => start(e, r).addColumnAfter().run(),
  },
  {
    title: 'Delete row',
    keywords: 'table remove',
    table: 'only',
    run: (e, r) => start(e, r).deleteRow().run(),
  },
  {
    title: 'Delete column',
    keywords: 'table remove',
    table: 'only',
    run: (e, r) => start(e, r).deleteColumn().run(),
  },
  {
    title: 'Delete table',
    keywords: 'table remove',
    table: 'only',
    run: (e, r) => start(e, r).deleteTable().run(),
  },
];

function insideNode(editor: Editor, name: string): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === name) return true;
  }
  return false;
}

/** The items that fit the typed text and the place the cursor is in. */
export function slashItems(editor: Editor, query: string): SlashItem[] {
  const inTable = insideNode(editor, 'table');
  const needle = query.trim().toLowerCase();
  return SLASH_ITEMS.filter((item) => {
    if (item.table === 'only' && !inTable) return false;
    if (item.table === 'never' && inTable) return false;
    return `${item.title} ${item.keywords}`.toLowerCase().includes(needle);
  });
}

export const slashMenuKey = new PluginKey('slashMenu');

/**
 * `/` opens the block menu at the start of an empty line or after a space (research memo notes.md
 * D5). Not in code. Escape closes it; a space in the typed text closes it too.
 */
export const SlashMenu = Extension.create({
  name: 'slashMenu',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashMenuKey,
        char: '/',
        allowedPrefixes: [' '],
        floatingUi: MENU_FLOATING,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.name === 'code')) {
            return false;
          }
          // At the start of a line the line must be empty apart from the typed text
          return $from.parentOffset > 0 || $from.parent.content.size === range.to - range.from;
        },
        items: ({ editor, query }) => slashItems(editor, query),
        command: ({ editor, range, props }) => {
          props.run(editor, range);
        },
        render: createMenuRenderer<SlashItem>({
          label: 'Insert a block',
          row: (item) => ({ text: item.title, hint: item.hint }),
        }),
      }),
    ];
  },
});
