---
name: ui-design-system
description: The Personal OS visual rules for any screen or component: tokens instead of hard-coded colors, module pastel colors, glass components, the three background modes, dark and light mode, minimal look, keyboard access, empty, loading and error states. Loads automatically for apps/desktop and packages/ui.
paths:
  - apps/desktop/**
  - packages/ui/**
---

# ui-design-system

Source of truth: `docs/DESIGN.md`. Follow it exactly. Liquid Glass (docs section 2b) is a separate, optional layer; do not add it to a screen unless asked. Read `pitfalls.md` here first. Details are in the supporting files: `tokens.md`, `components.md`, `states-and-keyboard.md`.

## The short version
- **Dark glass, minimal.** Quiet icons (Tabler outline, 14 to 18 px), lots of space, no heavy borders, details only on hover, focus, or selection. Sentence case everywhere. Fonts: Inter, weights 400, 500, 600 (headings and big numbers only).
- **Tokens only.** Colors come from CSS variables (`bg-glass`, `text-fg`, `text-fg-muted`, `text-danger`, `bg-input`, `bg-accent`, `text-on-tile`) defined in `packages/ui/src/styles/tokens.css` for both `data-theme` values. No hex or rgb in components. The only allowed literal colors are the module and tag pastel colors from `packages/shared` (`MODULES`, `TAG_PALETTE`, `moduleColorVar`) and `TEXT_ON_TILE` on top of them.
- **Module colors:** Tasks yellow #F7D96B, Notes peach, Habits lime, Graph periwinkle, Calendar orange, Mail sky, Drive grey-blue, Projects pink, Money mint, Assistant lavender (the app accent). Text on a pastel tile is always #1C1C1C.
- **Shapes:** radius 16 for tiles and glass cards, 18 dock, 10 buttons and inputs and dock icons, 8 chips. Spacing 4, 8, 12, 16, 24, 32. Borders 0.5 px.
- **Shared components** live in `packages/ui` (Button, IconButton, Input, GlassCard, Tile, SegmentedControl, Slider, Switch, Kbd, ProgressBar, Tooltip, ModuleAvatar, ActivityItem). Use them before building your own; build new shared pieces in `packages/ui` only when a second screen needs them.
- **Three backgrounds** (Transparent with Windows Acrylic, Wallpaper, Solid) and **two themes**. A screen must look right in all six combinations; never rely on what is behind the glass.
- **Keyboard:** everything reachable and operable without a mouse, visible focus (`focus-ring`), roving Tab stops in lists, Escape closes popups, shortcuts only when not typing and never with Ctrl (Ctrl combinations belong to the app shell).
- **States:** every screen has loading, empty, and error versions (a short sentence, a "Try again" button for errors, the server's message when it gave one).
- **Tests:** UI tests check no hard-coded colors (`document.documentElement.innerHTML` has no `#rrggbb`), dark and light, and keyboard use (see testing-patterns).

## Navigation
The bottom dock is the app navigation (no app-level sidebar). A module may have its own slim inner panel (Tasks does; see docs/features/tasks-redesign.md). The dock never moves for inner panels. Content sits under the 40 px transparent title bar and above the 80 px dock area.

## Before you finish a UI change
1. Look at it in dark and light, and in the three backgrounds (Settings → Appearance), at the minimum window size 1100×700.
2. Tab through it. Press Escape in every popup.
3. Update docs/DESIGN.md or the module doc when the look or behavior changed (docs-sync skill).
