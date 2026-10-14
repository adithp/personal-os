import type { Editor } from '@tiptap/core';
import { history } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';

/**
 * Throws away the undo history (Ctrl+Z must not step back through text from before a reload; the
 * old steps do not fit the new document). The history plugin keeps its state inside itself, so it
 * is taken out and put back with the options the editor's undo-redo extension has.
 */
export function clearUndoHistory(editor: Editor): void {
  const options = editor.extensionManager.extensions.find((ext) => ext.name === 'undoRedo')
    ?.options as { depth?: number; newGroupDelay?: number } | undefined;
  if (!options) return;
  editor.unregisterPlugin('history');
  editor.registerPlugin(history(options));
}

/**
 * Loads text that came from the server while the user has no unsaved edits. It is not an edit (no
 * update event, so nothing is saved), the cursor stays where it was (kept inside the new document)
 * and the undo history starts fresh.
 */
export function reloadQuietly(editor: Editor, markdown: string): void {
  const { anchor, head } = editor.state.selection;
  editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
  const { doc } = editor.state;
  const clamp = (pos: number) => doc.resolve(Math.min(pos, doc.content.size));
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.between(clamp(anchor), clamp(head))),
  );
  clearUndoHistory(editor);
}
