# Design system

The app uses a dark glass design with bright pastel tiles and a macOS-style magnifying bottom dock. A light mode uses the same layout, tiles, and colors on light glass. There is no app-level sidebar (the Tasks module has its own slim inner side panel, see docs/features/tasks-redesign.md).

## 1. Theme modes
Setting: Appearance → Theme = Dark, Light, or System. Default: System.

| Token | Dark | Light |
|---|---|---|
| bg | #15171C | #EEF0F3 |
| glass | rgba(255,255,255,0.07) | rgba(255,255,255,0.65) |
| glass-border | rgba(255,255,255,0.12) | rgba(0,0,0,0.07) |
| glass-strong (dock) | rgba(40,43,50,0.92) | rgba(255,255,255,0.85) |
| text-primary | #F2F2F2 | #1C1C1C |
| text-secondary | rgba(255,255,255,0.65) | rgba(0,0,0,0.6) |
| text-muted | rgba(255,255,255,0.45) | rgba(0,0,0,0.4) |
| text-on-tile | #1C1C1C | #1C1C1C |
| danger | #F28B82 | #C5221F |
| tint (background layer) | rgba(21,23,28,0.55) | rgba(238,240,243,0.55) |

Define all tokens as CSS variables in packages/ui and switch them with a data-theme attribute on the root.

## 2. Background
The window background has three modes. Setting: Appearance → Background = Transparent, Wallpaper, or Solid. Default: Transparent.

| Mode | What shows behind the glass |
|---|---|
| Transparent (default) | The Windows desktop shows through the window, blurred, like macOS vibrancy. A tint layer sits on top so text and pastel tiles stay readable on any desktop wallpaper. |
| Wallpaper | A built-in gradient (dark for dark mode, light for light mode) or an uploaded image. Glass panels blur it with the blur setting. |
| Solid | The solid bg color. |

- The window has rounded corners (8 px, the same as Windows 11's own window rounding; the window shadow is on so Windows rounds the Acrylic too) and goes square when maximized.
- Transparent mode uses a transparent Tauri window with the Windows Acrylic effect (Mica as the fallback when Acrylic is not available). Acrylic can make dragging and resizing the window less smooth on some Windows 10 and 11 builds.
- Tint layer (the tint token in section 1): dark mode rgba(21,23,28,0.55), light mode rgba(238,240,243,0.55). It is the bg color at 55% opacity.
- Glass cards, tiles, the dock, and the title bar keep their normal style on top of every mode.
- Blur strength (0–40 px, default 24) and the image choice (built-in gradient or upload) are shown only for Wallpaper. Blur is the backdrop-filter blur of glass panels. The saved blur value applies in every background mode; only the slider is limited to Wallpaper.
- If the Acrylic effect is not supported or fails, the app falls back to Wallpaper mode automatically for that session. The saved choice stays Transparent.
- Saved settings from before this change (Wallpaper On/Off) migrate safely: Off becomes Solid, anything else becomes the default Transparent.

## 2b. Liquid Glass
Glass panels can look like Apple's Liquid Glass. Setting: Appearance → Glass effect = Liquid (default), Simple, or Off. Liquid also has a Strength slider (0–100, default 50).

| Effect | What panels look like |
|---|---|
| Liquid | The background bends near the edges of the glass, with a bright rim, shine, inner glow, and a boosted blur. |
| Simple | The plain blurred glass described in sections 1 to 6. |
| Off | Solid panels (theme panel color), no blur. The lowest power use. |

What Liquid adds, on top of the normal glass look:
- **Edge refraction:** an SVG feDisplacementMap used through backdrop-filter, so the background is pulled inward along the rounded edges (a lens-like rim) and is untouched in the flat middle. The strength slider sets how far it bends (0 to 36 px at the very edge; default about 18 px).
- **Quiet edge:** no white outline. A faint 1 px dark hairline, a soft darker edge at the bottom, and an inner glow. Everything is drawn in whole pixels, so the edge is even at 100%, 125%, and 150% display scaling.
- **Inner glow and specular shine:** a faint glow inside the edge and a soft highlight from the top-left corner.
- **Blur and color boost:** the glass blur setting scaled down (about 30%) plus a saturation and brightness boost of what is behind.

Where it is used:
- Glass cards, the assistant card, the dock, the command palette, tooltips, activity items, secondary buttons, icon buttons, segmented controls, the login card, and the dashboard search bar.
- Inputs become glass wells (dark inner top edge, light rim at the bottom).
- Window buttons turn into a small Liquid glass pill on hover (Close stays red).
- Pastel module tiles, dock icons, and icon squares keep their solid colors but get the rim light and shine on top. A hovered tile or dock icon brightens slightly.
- Not used: the title bar itself (transparent) and small short-lived elements such as tooltips, which get the edge and shine but no refraction.

Fit with the backgrounds and themes:
- Works in dark and light mode with their own rim, glow, and fill values (tokens named lg-*), and in all three background modes.
- Refraction can only bend what the page itself draws behind a panel (the wallpaper, other panels, the tint). In Transparent mode the blurred Windows desktop is added by Windows underneath the whole window, so it cannot be refracted; there the glass shows the rim, shine, glow, and boosted blur, and bends the tint and other panels.

How it works (no WebGL, no page screenshots, no extra library):
- Each glass element gets an SVG filter whose displacement map is a small image drawn on a canvas for its size (sizes are rounded to 8 px, 96 px for the dock, so many elements share one filter).
- The mode is set with data-glass="liquid" | "simple" | "off" on the page root; the look comes from inherited CSS variables, so any wrapper can preview a mode (the UI gallery shows all three side by side).
- Tokens (both themes, packages/ui/src/styles/tokens.css): panel-solid, panel-solid-strong, lg-fill, lg-fill-strong, lg-hairline (the 1 px edge), lg-rim-soft, lg-rim-dark (soft bottom edge), lg-glow, lg-shine, lg-input-dark (dark inner top edge of inputs). lg-rim-light and lg-edge exist but the current quiet-edge look does not use them.
- Other tokens: tile-action-bg, progress-track, progress-fill, window-close, wallpaper-default (a gradient per theme), glass-blur, and the durations (fast 150 ms, normal 200 ms). Until data-theme is set the root uses the dark values.

Fallback and limits:
- If the browser cannot apply an SVG filter to a backdrop (only Chromium, which includes WebView2, can) or cannot draw the maps, the app shows Simple automatically. The saved choice stays Liquid and Settings explains it.
- Settings are saved on this device with the other appearance settings.

## 3. Module colors
Every module has one pastel color used everywhere: dock icon, dashboard tile, page header accent, graph node color, and activity feed avatar. Text and icons on these colors are always #1C1C1C.

| Module | Color | Hex |
|---|---|---|
| Dashboard | Light gray | #E8E8E8 |
| Tasks | Yellow | #F7D96B |
| Habits | Lime | #C6E46E |
| Notes | Peach | #F0C9A0 |
| Knowledge graph | Periwinkle | #B8C4F7 |
| Calendar | Orange | #F6A462 |
| Mail | Sky blue | #93D3F5 |
| Drive | Slate | #C5CCD6 |
| Projects | Pink | #F4A9C4 |
| Money (Finance, Wallet, Subscriptions) | Mint | #9EE0C8 |
| AI assistant (also the app accent) | Lavender | #C9B4F7 |
| Settings | Gray | #A9A9A9 |

The app accent is lavender #C9B4F7: assistant send button, active states, focus rings, primary buttons.

## 4. Typography
- Font: Inter (bundled with the app).
- Weights: 400 regular, 500 medium, 600 semibold (headings and big numbers only).
- Sizes: page title 22, section title 16, card title 13, body 13, small 11, big tile number 30 (28–32 allowed).
- Sentence case everywhere.

## 5. Shapes and spacing
- Spacing scale: 4, 8, 12, 16, 24, 32.
- Radius: tiles and glass cards 16, dock 18, dock icons 10, buttons and inputs 10, chips 8.
- Borders: 0.5 px using glass-border.
- No drop shadows on cards; depth comes from glass and blur (Liquid Glass adds inner highlights only, see section 2b). The one exception is the accent glow under the lavender send button of the quick add bar.

## 6. Components
### Tile (dashboard widget, colored)
- Background: module color. Text #1C1C1C.
- Top left: small title (12, medium).
- Top right: 24×24 action button, rgba(0,0,0,0.12) background, radius 7, arrow-up-right icon. Opens the module.
- Middle: icon + big number (28–32, semibold) + short unit text.
- Bottom: one or two short lines (11), optional progress bar (5 px, track rgba(0,0,0,0.15), fill #1C1C1C).

### Glass card
- Background glass, border glass-border, radius 16, padding 12–16.
- Used for: assistant card, search bar, activity feed items, lists, editors, settings panels.

### Activity item
- Glass card with a 26 px round avatar in the module color, a bold title line, and a one-line description.

### Buttons
- Primary: lavender background, #1C1C1C text, radius 10.
- Secondary: glass background, glass-border, text-primary.
- Icon button: 30×30 glass.

### Inputs
- Glass background rgba(255,255,255,0.06) in dark, rgba(0,0,0,0.04) in light, radius 10, placeholder text-muted.

### Icons
- Tabler Icons (outline) everywhere.
- Module icons: Dashboard layout-dashboard, Tasks checklist, Habits flame, Notes notes, Graph affiliate, Calendar calendar, Mail mail, Drive brand-google-drive, Projects briefcase, Money wallet, AI assistant sparkles, Settings settings.

### Tooltip
- Glass-strong background, radius 8, 11 px text, shown above the element on hover or keyboard focus; Escape hides it.

### Keyboard hint (Kbd)
- Small chip per key: input background, 0.5 px glass-border, radius 8, 11 px muted text, height 20.

### Sizes of controls
- Primary and secondary buttons and inputs are 34 px high. An input has a transparent 0.5 px border that turns accent on keyboard focus and danger when invalid.

### Segmented control, switch, slider, progress bar, avatar
- Progress bar tones: `tile` (dark fill on a dark track, for pastel tiles) and `glass` (Tasks yellow fill on the translucent progress track, visible on light and dark glass; for goal cards and the goal page). The bar takes an optional `valueText` for screen readers ("3 of 8 tasks"). The detail Popover can align to the right edge (`align="end"`) so a menu at the far right is not cut off.
- Segmented control: a glass radio group; options 28 px high, radius 8; the chosen one is lavender with dark text; arrow keys move the choice.
- Switch 36×20, lavender when on. Slider 160 px wide, accent colored. Progress bar 5 px. Module avatar 26 px.

### Quick add bar (Tasks)
- A glass bar 40 px high, radius 16, with a thin inner top highlight. Left: a 24 px input-colored square with a plus icon. Middle: a borderless text field ("Add a task…"). Right: a 28 px lavender gradient send button with an arrow (accent glow), at 45% opacity and disabled while the field is empty. On focus the border turns accent. Enter adds. Under the bar, when the text contains something understood (date, priority, tag, repeat), a quiet row of small chips shows it (kind icon, label, and an x "Ignore ..." with a 24 px hit area; same size and radius as tag chips, no new colors). One slot of fixed minimum height under the bar holds the chips, the hint, or "Add a title", so the list below does not jump. Screen readers get a hidden status line ("Understood: ...") that updates half a second after typing stops, instead of a live chip row. When the box is focused and empty a small muted line suggests "Try: Pay rent every month #home !high"; when only a date or tag is typed and no title, send is disabled and "Add a title" shows.

### Toast
- Glass-strong, radius 10, padding 16×8, centered 96 px above the bottom (above the dock): the message, an optional accent action button (Undo), and a dismiss X. Info toasts use text-primary, error toasts text-danger (announced as alerts). They stay 5 s, or 8 s with an action; the timer waits while the mouse is over a toast or focus is inside it. At most 3 at once; the oldest drops.

### Menus and popovers
- Glass-strong, radius 16, 0.5 px border, items 28 px high, arrow-key navigation, Escape and outside click close them; they use the menu roles.

### Task checkbox, card, row, chips
- Round checkbox 18 px with a 1.5 px border, module yellow with a check when done.
- Task card: glass, radius 16, padding 12, in a grid of columns at least 180 px wide, lifts 2 px on hover (not with reduced motion), lavender ring when selected, 60% opacity when done. Priority flag colors: Urgent danger red, High Calendar orange, Medium Tasks yellow, Low none. Tag chips: radius 8, height 20, dark text on the tag color. Blocked badge: input-colored chip with a lock icon. Overdue due text uses the danger color.

### Favorites and Manage tags (Tasks)
- Side panel Favorites: a muted 11 px header with a + icon button, then 32 px rows like the nav rows: a 16 px square (radius 5) in the favorite's palette color with a 12 px dark Tabler glyph, the name (one line), a "more" button on hover or focus; the active view gets the active row look. The collapsed panel shows only the squares with tooltips. Menus are portal-rendered, fixed-position glass-strong menus (224 px wide).
- Overview favorite tiles: compact pastel tiles in the favorite's color with the name, the open count and one muted line ("2 overdue" or "Nothing overdue"); the whole tile is one link.
- Manage tags dialog: glass-strong, 440 px wide, radius 16, dimmed page, focus trap, Esc closes; rows of 36 px with a 12 px color dot, the name, a muted usage count, and rename and delete icons on hover; rename, merge and delete questions are inline in the row (the answer that is not destructive has focus first). Icon buttons in rows are quiet ghost buttons (plain icon, hover tint, no glass chip) with a 24 px hit area; color and icon pickers have named swatches and move with the arrow keys, Home and End; after a delete or merge the dialog footer shows a status line with an Undo button inside the focus trap.

### Goals (Tasks)
- Goal card: glass, radius 16, padding 16, minimum column 260 px, 2 px lift on hover (none with reduced motion); a 26 px round Tasks-yellow square with a dark target icon, the title (13 medium, two lines), a `glass` progress bar with "3 of 8 tasks" and the percent, the target line (red "Target passed" only for an active goal), and a "Mark as achieved" text button above the stretched title link. The goal page uses a glass progress card, an inline "Mark as achieved?" row (not a dialog, no animation) and a Tasks card.

### Charts (Tasks Reporting)
- Glass cards with a 13 px title, a muted 11 px subtitle and a "Show table" text button; stat cards have a 30 px number and one 11 px muted line.
- One hue per chart (the module color `var(--module-tasks)`), columns at most 24 px wide with 4 px rounded tops, a hairline baseline and about 3 to 4 faint gridlines in `var(--glass-border)`, whole-number Y ticks, axis text 11 px muted, no legend. Tooltips are glass-strong, radius 8, 11 px, and never hold information that is not also in the table view.
- Text never uses the series color. In light mode the yellow bars are faint, so values are always readable without color (labels, tooltip, tiles, table).

### Board and drag and drop (Tasks)
- Board: three glass columns (To do, In progress, Done), each with its name and count; the cards are the normal task cards. An empty column says "Nothing here". While dragging, a quiet accent line shows where the card will land and the other cards do not shift.
- Drag handle: a small grip at the top right of a card (left of a row), invisible until the card is hovered or focused; the cursor is a grab hand.
- While dragging, the dragged card stays behind at 40% opacity and a copy follows the pointer. A section or column that can receive the drop gets a thin accent ring; Overdue never does. In the Archived view nothing can be dragged.
- The Upcoming date picker is a small glass popup with a date field (starts on tomorrow), Move and Cancel.
- One quiet line of small muted text, "Sort is not Manual, so reordering is off.", shows when Sort is not Manual.

### Login screen
- A centered glass card (max 384 px) with a 48 px lavender sparkle square, the title "Sign in", Email and Password fields, and a full-width primary button. Without Supabase settings it shows a card "The app is not configured" listing the missing variables. It sits inside the same background and title bar.

## 6b. Title bar
The window is frameless. The title bar is not a separate bar: it is fully transparent, so the background and the page show straight through and the top of the window looks like one continuous surface.
- Height 40 px, overlaying the top of the page area. Page content has 40 px of top padding so it never sits under the buttons.
- No background, no border, no blur, no separate color.
- The whole empty area is a drag region; double-click maximizes and restores.
- App name: left side, 11 px, text-muted, no logo or background behind it.
- Window buttons on the right (minimize, maximize/restore, close): 36×28, thin icons in text-secondary, no background by default.
- Hover: soft glass background (glass token), radius 8. Close on hover: red (#E81123, token window-close) with a white icon.
- The same look in dark and light mode.

## 7. Dock (main navigation)
- Position: bottom center, 10 px above the window edge, floating.
- Look: glass-strong background, radius 18, horizontal padding 10 px, height 60 px (Small and Medium icons); with Large icons the height grows to icon size + 24 (68 px).
- Icons: 36×36 tiles in module colors, radius 10, gap 6, dark icon glyph.
- Order: Dashboard, Tasks, Habits, Notes, Graph, Calendar, Mail, Drive, Projects, Money | divider | AI assistant, Settings.
- Hover: magnification. Size scales up to 1.7× for the icon under the cursor and falls off within 90 px. Built with Motion (formerly Framer Motion).
- Tooltip with the module name above the hovered icon.
- Active module: 4 px dot under its icon.
- Settings: Dock → Auto-hide (default Off), Magnification (default On), Icon size (Small 32 / Medium 36 / Large 44, default Medium).
- Auto-hide: dock slides down out of view; it slides up when the cursor enters the bottom 28 px of the window, and hides 400 ms after the cursor leaves.

## 8. Dashboard layout
Two columns under the title bar: a main column and a wider right column (280 px).

Main column, top to bottom:
- Greeting (22) with the date (11) under it.
- Search field: one wide glass field the full width of the column, with a magnifier on the left and a "Ctrl K" hint on the right. Click it, press Enter, or just type: the command palette opens with what you typed, and the field itself stays empty.
- Assistant card: glass, full width of the main column, lavender sparkle icon, 1–2 line daily summary, input "Ask or tell me what to do", lavender send button.
- Card grid: three columns, two rows, every card exactly the same size (equal rows, so no card is a short wide strip). Row one: Today's tasks (yellow), Important emails (Mail blue), Money (mint). Row two: Streak (lime), Projects (pink), and the Quick actions card.
- Quick actions card: a glass card the size of a tile with the title "Quick actions" and four glass buttons in a 2 by 2 grid: New task, New note, Log expense, New event. Each has a 22 px rounded icon square in its module color (Tasks yellow, Notes peach, Money mint, Calendar orange) with a dark icon. The note line under the buttons always keeps its space, so the card never changes size when you click.

Right column, top to bottom, all glass cards:
- Mini calendar: month name with previous and next arrows, weekday header starting Monday, today highlighted with the lavender accent, a small orange dot under days that have events. Clicking a day opens the Calendar page.
- Upcoming: events grouped by "Today" and "Tomorrow", at most 4. Each has a thin (3 px) bar in its module color, the title, and the time; the next event also shows "in 45 min".
- Activity: the latest 3 items and a "View all" link.

Fit and scrolling:
- The title bar overlays the top (content starts 40 px down) and the dock floats over the bottom (the page area keeps 80 px of bottom padding), so nothing sits under them.
- The Dashboard and Tasks pages never scroll as a whole (other pages scroll inside the page area). At the 1100×700 minimum the whole main column fits without scrolling; the right column scrolls on its own. If the window is ever too short, each column scrolls independently.
- The compact tile size (Tile compact) still exists in packages/ui for crowded screens but the dashboard uses the normal tile size.

## 9. Keyboard
- Ctrl K: global search and command palette.
- Ctrl 1 to Ctrl 9: Dashboard, Tasks, Habits, Notes, Graph, Calendar, Mail, Drive, Projects.
- Ctrl 0: Money. Ctrl J: open AI assistant. Ctrl , : Settings.
- Tasks page, plain keys: N, Space, Enter, Delete, Esc, arrows, ?. Inbox also: T date, L tag, 1 to 4 priority.
- Notes page, plain keys (never Ctrl; not while typing in the editor or a field, a menu, a dialog or the palette): N new note, Up and Down, Enter (opens the note and puts the cursor in the editor), Esc in the editor (back to the list row), Delete (to the trash, with Undo), ?.

### Command palette
- Opens with Ctrl K, or by clicking the dashboard search bar. Esc, or Ctrl K again, closes it. It is only available on signed-in screens.
- A glass-strong panel, 560 px wide, radius 16, near the top of the window over a dimmed page. A search field with an Esc hint, a list, and a hint line ("↑ ↓ to move · Enter to open · Esc to close").
- Groups: Go to (every module in dock order, with its shortcut), Appearance (dark, light, or system theme; the current one is marked), and Dock (toggle auto-hide, showing On or Off).
- Module commands use a 22 px icon square in the module color; other commands use a neutral square.
- Typing filters the commands at once by whole or partial words in the title or its keywords (for example "night" finds the dark theme); the app does this itself (cmdk runs with `shouldFilter={false}`). The selected row uses the input background.
- The placeholder is "Search or type a command…". Data results come below the commands, in groups Tasks and Tags, with the same muted 11 px headings; the selection does not jump when results arrive. The server is asked 150 ms after typing stops, from 2 characters (one character only filters commands); typed-over requests are cancelled.
- Result rows are 36 px (48 px with a snippet line). A task row has a 22 px Tasks-yellow icon square, the title, an optional muted one-line snippet, and a muted 11 px text on the right: Archived, Done, the due day (red when overdue), or Subtask. A tag row has a neutral square with a 10 px dot in the tag's color.
- Matched word starts in titles and snippets are marked with `.search-mark`: a soft accent background (30% in dark mode, 50% in light mode), radius 8, never bold (semibold is for headings only); high-contrast mode uses the system Mark colors.
- While new results load, the old rows stay at 60% opacity and cannot be opened; with no old rows, a muted "Searching…" row shows after 300 ms. No match: centered "Nothing found for “abc”." with an 11 px line "Search finds tasks and tags by the start of their words.". Error: the commands still work and a danger-colored row says "Search is not available right now." (503 schema_behind shows "Database update needed: run pnpm db:migrate"). A hidden `role="status"` region announces the result count.
- An empty field shows "Recent" (the last 5 items opened from the palette, kept on this device, cleared on sign-out) above the commands. Enter on a task opens `/tasks/my-tasks?task=<id>` (adds `archived=true` for an archived task); on a tag it opens My tasks filtered by that tag.
- All Ctrl shortcuts live in one registry (apps/desktop/src/commands/shortcuts.ts). The Tasks page has its own plain-key shortcuts (N, Space, Enter, Delete, Esc, arrows, ?; see docs/features/tasks-redesign.md) that never use Ctrl, so they cannot clash with the global ones. Shortcut keys are cancelled in the page so Windows' own use of them (for example Ctrl J for downloads) does not also run.

## 10. Mobile (Phase 2)
- Same tokens, colors, tiles, and glass.
- Navigation: bottom tab bar with Dashboard, Tasks, AI assistant, Calendar, More. No magnification on mobile.

## 11. Motion
- Duration 150–250 ms, ease-out. The dock slide takes 200 ms. Hover lifts and transitions are switched off for people who prefer reduced motion.
- Tiles lift 2 px on hover. Dock magnification follows the cursor without delay.

### Notes (stage N1)
- Three columns inside the page, like Tasks: an inner side panel (224 px, collapsible to 56 px: All notes, a Folders tree up to 3 levels with a + button, Trash; Today, Tags and Templates show "Soon"), a 272 px glass note list (place name and count, "Filter notes" field, New note button, sort menu; rows with a pin, the title in 13 medium, and one muted 11 px line with the date and the start of the text), and the editor in a glass card. There is no app-level sidebar (Tasks and Notes have inner side panels). Peach is the Notes accent (checkbox, quote bar, link underline, selection).
- The editor: a top bar with the save status (11 px muted: "Saving…", "Saved", "Not saved, retrying" in the danger color), a borderless 22 px semibold title field, the body (headings 22, 16 and 13 px semibold, lists, checklists, quotes, code, tables, links), and a muted footer "N words · Edited 2 min ago". A quiet bar above the body says "This note was changed on another device." with Keep mine and Use theirs. Trash rows have Restore and Delete forever (with a confirm) and the list header has Empty trash.
