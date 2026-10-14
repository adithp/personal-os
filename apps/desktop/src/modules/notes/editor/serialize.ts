import type { Editor } from '@tiptap/core';

/**
 * The Markdown text to store for the editor's content. Tables are written with a leading newline,
 * so the ends are trimmed; the text stays stable when loaded and saved again.
 */
export function serializeNote(editor: Editor): string {
  return editor.getMarkdown().trim();
}
