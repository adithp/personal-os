/** Where the editor pane is drawn (see shell/editor-slot.tsx). */
export const EDITOR_SLOT = '[data-notes-editor]';

/**
 * Puts the cursor in the note's body once the editor has drawn it (it loads the note first, so it
 * may take a moment). Gives up after about a second. Returns a function that stops the waiting.
 */
export function focusEditor(): () => void {
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const body = document.querySelector<HTMLElement>(
      `${EDITOR_SLOT} [contenteditable="true"], ${EDITOR_SLOT} .ProseMirror`,
    );
    if (body) {
      body.focus();
      clearInterval(timer);
    } else if (tries >= 20) {
      clearInterval(timer);
    }
  }, 50);
  return () => {
    clearInterval(timer);
  };
}
