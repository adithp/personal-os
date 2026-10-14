import type { Extensions } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { SlashMenu } from './slash-menu/slash-menu';
import { NoteTags, type NoteTagOptions } from './tags/note-tags';
import { WikiLink, type WikiLinkOptions } from './wikilink/wikilink';

/**
 * The editor's extensions (research memo notes.md D1, D5). Only nodes and marks with Markdown rules
 * are loaded, so what the editor shows is what the Markdown text keeps. Underline is off (plain
 * Markdown has no underline). TableKit is loaded so tables round-trip; there is no insert button.
 */
export function createNoteExtensions(
  wikilink?: Partial<WikiLinkOptions>,
  tags?: Partial<NoteTagOptions>,
): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit,
    WikiLink.configure(wikilink),
    SlashMenu,
    NoteTags.configure(tags),
    Placeholder.configure({ placeholder: 'Start writing…' }),
    CharacterCount,
    Markdown.configure({ markedOptions: { gfm: true } }),
  ];
}
