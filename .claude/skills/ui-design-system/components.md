# Components and patterns

All in `packages/ui/src/components` (exported from `packages/ui/src/index.ts`); try them in the gallery with `pnpm dev:ui`.

- **GlassCard** (`rounded-card glass`, padding 12 or 16): lists, editors, settings panels, popups.
- **Tile** (module-colored dashboard widget): title 12 medium, 24 px action button top right, icon + big number, bottom lines, optional ProgressBar. Text #1C1C1C.
- **Button:** primary is lavender with dark text; secondary is glass. **IconButton** 30×30 glass, always with `aria-label`.
- **Input:** faint glass, radius 10, placeholder muted, `aria-label` when there is no visible label.
- **SegmentedControl:** a radio group; arrow keys move the choice; only the chosen option is a Tab stop.
- **Switch, Slider, ProgressBar, Kbd, Tooltip (`data-liquid-skip`), ModuleAvatar, ActivityItem.**
- **Dock:** `apps/desktop/src/dock`: magnifying icons, auto-hide, the active module marked `aria-current`.
- **Title bar:** transparent 40 px with the app name and window buttons (minimize, maximize, close); it overlays the top of the page.

Patterns built in the Tasks module that other modules should reuse in spirit (build shared versions in `packages/ui` when a second module needs them):
- A quiet list row: round checkbox, title, small muted details on the right, actions only on hover or focus.
- Cards in a responsive grid: `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`, gap 8 px, lift 2 px on hover.
- Small menus: plain React, closes on Escape and outside click, arrow-key navigation, `role="menu"` with `menuitem*` items.
- Toasts (Undo): `useToasts().show(message, { action })`, rendered by `ToastHost`.
- A glass command bar for quick add: a rounded container with an icon square, a transparent input, and a compact lavender gradient submit button.
