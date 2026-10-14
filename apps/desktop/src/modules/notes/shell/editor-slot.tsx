import { moduleColorVar } from '@personal-os/ui';
import { IconNotes } from '@tabler/icons-react';
import type { KeyboardEvent } from 'react';
import { NoteEditorPane } from '../editor/note-editor-pane';

const POPUPS = '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]';

/** Back to the open note's row in the list (or the first row, or the filter field). */
function focusList(noteId: string | null) {
  const target =
    (noteId
      ? document.querySelector<HTMLElement>(`[data-note-row][data-note-id="${noteId}"]`)
      : null) ??
    document.querySelector<HTMLElement>('[data-note-row]') ??
    document.querySelector<HTMLElement>('input[aria-label="Filter notes"]');
  target?.focus();
}

/**
 * Where the editor sits: the open note's editor, or a hint when none is open. Escape inside the
 * editor (with no popup open) hands the focus back to the list. The editor is created again for
 * each note, so leaving a note unmounts it and it saves what is left.
 */
export function EditorSlot({ noteId }: { noteId: string | null }) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (document.querySelector(POPUPS)) return;
    event.preventDefault();
    focusList(noteId);
  };

  return (
    <section
      aria-label="Note editor"
      data-notes-editor
      onKeyDown={onKeyDown}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-card glass"
    >
      {noteId ? (
        <NoteEditorPane key={noteId} noteId={noteId} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <span
            className="flex size-12 items-center justify-center rounded-tile text-on-tile"
            style={{ backgroundColor: moduleColorVar('notes') }}
          >
            <IconNotes size={24} stroke={1.75} aria-hidden />
          </span>
          <h2 className="text-section font-medium text-fg">No note open</h2>
          <p className="max-w-xs text-body text-fg-muted">
            Choose a note from the list, or press N to start a new one.
          </p>
        </div>
      )}
    </section>
  );
}
