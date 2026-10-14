import { flip, shift, size } from '@floating-ui/dom';
import type { PluginKey } from '@tiptap/pm/state';
import {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';
import './suggestion-menu.css';

/** What one row of the menu shows. */
export interface MenuRow {
  text: string;
  /** Quiet text on the right (for example a markdown shortcut). */
  hint?: string;
}

/**
 * Placement for `Suggestion({ floatingUi })`: the menu is fixed to the window (so a scrolling page
 * cannot clip it), flips above the line when there is no room below, is kept 8 px inside the edges
 * and gets a shorter max height when the room is small. Use it with `flip: false` on the
 * Suggestion, so the flip is not done twice.
 */
export const MENU_FLOATING = {
  strategy: 'fixed' as const,
  middleware: [
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ availableHeight, elements }) {
        // The CSS caps the height at 320 px; this only makes it shorter when the room is smaller
        elements.floating.style.setProperty(
          '--menu-room',
          `${String(Math.max(0, Math.floor(availableHeight)))}px`,
        );
      },
    }),
  ],
};

let menuCount = 0;

/**
 * The glass menu for a Suggestion plugin (docs/DESIGN.md, Menus and popovers). The editor keeps
 * the focus while typing, so the rows are an ARIA listbox that the editor points to with
 * `aria-activedescendant`; the arrow keys, Enter and Escape reach the plugin through the editor's
 * key handler. The menu hides itself when there is nothing to show. Text is set with
 * `textContent`, so note titles can never inject markup.
 */
export function createMenuRenderer<T>(options: {
  label: string;
  row: (item: T) => MenuRow;
  /** The key of the Suggestion this menu belongs to (to close it when the editor loses focus). */
  pluginKey: PluginKey;
}) {
  return () => {
    const listId = `suggestion-menu-${String(++menuCount)}`;
    let element: HTMLDivElement | null = null;
    let unmount: (() => void) | null = null;
    let props: SuggestionProps<T> | null = null;
    let selected = 0;

    // The menu lives in document.body, so it must go when the focus leaves the editor (the palette
    // opens, another window is chosen); the pointer never takes the focus (see mousedown below)
    const onFocusOut = () => {
      if (props) exitSuggestion(props.editor.view, options.pluginKey);
    };

    const rows = () => [...(element?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];

    const mark = () => {
      const editorDom = props?.editor.view.dom;
      rows().forEach((row, index) => {
        const on = index === selected;
        row.setAttribute('aria-selected', String(on));
        if (on) {
          row.scrollIntoView({ block: 'nearest' });
          editorDom?.setAttribute('aria-activedescendant', row.id);
        }
      });
    };

    const choose = (index: number) => {
      const item = props?.items[index];
      if (item !== undefined) props?.command(item);
    };

    const render = () => {
      if (!element || !props) return;
      const items = props.items;
      element.replaceChildren();
      element.hidden = items.length === 0;
      items.forEach((item, index) => {
        const { text, hint } = options.row(item);
        const row = document.createElement('div');
        row.id = `${listId}-${String(index)}`;
        row.setAttribute('role', 'option');
        row.className = 'suggestion-row';
        const label = document.createElement('span');
        label.className = 'suggestion-row-text';
        label.textContent = text;
        row.append(label);
        if (hint) {
          const quiet = document.createElement('span');
          quiet.className = 'suggestion-row-hint';
          quiet.textContent = hint;
          row.append(quiet);
        }
        // The editor must keep the focus and the selection while the pointer is on a row
        row.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        row.addEventListener('click', () => {
          choose(index);
        });
        row.addEventListener('mousemove', () => {
          if (selected === index) return;
          selected = index;
          mark();
        });
        element?.append(row);
      });
      // No rows, nothing to point at
      if (items.length === 0) props.editor.view.dom.removeAttribute('aria-activedescendant');
      mark();
    };

    return {
      onStart(next: SuggestionProps<T>) {
        props = next;
        selected = 0;
        element = document.createElement('div');
        element.id = listId;
        element.setAttribute('role', 'listbox');
        element.setAttribute('aria-label', options.label);
        element.className = 'suggestion-menu glass-strong rounded-card';
        // A click on the menu's own scrollbar or padding must not take the focus either
        element.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        next.editor.view.dom.addEventListener('focusout', onFocusOut);
        unmount = next.mount(element);
        next.editor.view.dom.setAttribute('aria-controls', listId);
        render();
      },
      onUpdate(next: SuggestionProps<T>) {
        const changed = props?.query !== next.query || props.items.length !== next.items.length;
        props = next;
        if (changed) selected = 0;
        render();
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        const count = props?.items.length ?? 0;
        if (count === 0 || event.isComposing) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          selected = (selected + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
          mark();
          return true;
        }
        if (event.key === 'Enter') {
          choose(selected);
          return true;
        }
        return false;
      },
      onExit(last: SuggestionProps<T>) {
        last.editor.view.dom.removeEventListener('focusout', onFocusOut);
        unmount?.();
        unmount = null;
        element = null;
        props = null;
        last.editor.view.dom.removeAttribute('aria-controls');
        last.editor.view.dom.removeAttribute('aria-activedescendant');
      },
    };
  };
}
