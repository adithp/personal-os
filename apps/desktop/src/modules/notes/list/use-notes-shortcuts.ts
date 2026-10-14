import { useEffect, useRef, type RefObject } from 'react';
import { usePalette } from '../../../store/palette-store';

export interface NotesShortcutHandlers {
  /** The element that holds the note rows. */
  rootRef: RefObject<HTMLElement | null>;
  onNew: () => void;
  /** Enter on a row. */
  onOpen: (noteId: string) => void;
  /** Delete on a row. */
  onDelete: (noteId: string) => void;
  /** D: open (or create) today's daily note. */
  onDaily: () => void;
  onHelp: () => void;
}

// Same guards as the Tasks keys: typing, open menus and dialogs, and the palette own the keyboard
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const POPUPS = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';

/**
 * The plain-key shortcuts of the Notes page: N new note, Up and Down between notes, Enter opens
 * the focused note, Delete moves it to Trash (or deletes it for good in Trash), ? shows the help.
 * D opens today's daily note. Never with Ctrl, Meta or Alt; not while typing in a field or the editor, not inside a menu or
 * dialog, and not while the command palette is open.
 */
export function useNotesShortcuts(handlers: NotesShortcutHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (usePalette.getState().open) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(`${TYPING}, ${POPUPS}`)) return;

      const { rootRef, onNew, onOpen, onDelete, onDaily, onHelp } = latest.current;
      const row = target?.closest<HTMLElement>('[data-note-row]') ?? null;
      const noteId = row?.dataset.noteId;
      // Enter and arrows work on the row itself, not on a button inside it (Enter there clicks it)
      const onRow = row !== null && target === row;

      switch (event.key) {
        case 'n':
        case 'N':
          event.preventDefault();
          if (!event.repeat) onNew();
          return;
        case 'd':
        case 'D':
          event.preventDefault();
          if (!event.repeat) onDaily();
          return;
        case '?':
          event.preventDefault();
          onHelp();
          return;
        case 'Enter':
          if (!onRow || !noteId) return;
          event.preventDefault();
          if (!event.repeat) onOpen(noteId);
          return;
        case 'Delete':
          if (!row || !noteId) return;
          event.preventDefault();
          if (!event.repeat) onDelete(noteId);
          return;
        case 'ArrowDown':
        case 'ArrowUp': {
          if (!onRow) return;
          const rows = [
            ...(rootRef.current?.querySelectorAll<HTMLElement>('[data-note-row]') ?? []),
          ];
          const next = rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)];
          event.preventDefault();
          next?.focus();
          return;
        }
        default:
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
