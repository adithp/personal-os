# States, keyboard, and accessibility

## States every screen has
- **Loading:** a quiet line ("Loading tasks…"), no spinners that jump.
- **Empty:** one sentence telling what to do ("No tasks yet. Type above and press Enter to add your first one.").
- **Error:** the server's message in a `role="alert"` glass card with a "Try again" button (`ApiError.message` is already safe to show). A pending database migration shows "Database update needed: run pnpm db:migrate".
- **Disabled / not built yet:** disabled with a small "Soon" label, not a link, not hidden.

## Keyboard
- Everything operable by keyboard. Lists use one Tab stop per row (roving `tabIndex`); children that would add Tab stops get `tabIndex={-1}`.
- Page shortcuts (plain keys) only when focus is not in an input, textarea, select, contenteditable, a menu or dialog, the command palette is closed, and no Ctrl, Meta, or Alt is held. Ctrl combinations belong to the app shell (`apps/desktop/src/commands/shortcuts.ts`: Ctrl K palette, Ctrl 1 to 9 modules, Ctrl J, Ctrl 0).
- Escape closes the innermost popup first, then the panel. Focus returns to the control that opened it.
- Drag and drop (dnd-kit) always has a keyboard alternative.
- Popups: menus use `role="menu"` with `menuitem`, `menuitemcheckbox`, `menuitemradio`; dialogs trap focus.

## Accessibility basics
- Icon-only buttons have `aria-label`; decorative icons `aria-hidden`.
- Toast container is an always-present live region; errors are `role="alert"`.
- Color is never the only signal (overdue is also the word "Overdue" for screen readers).
- Respect `prefers-reduced-motion` (`motion-reduce:` variants).
