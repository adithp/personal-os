# Design system

The app uses a dark glass design with bright pastel tiles and a macOS-style magnifying bottom dock. A light mode uses the same layout, tiles, and colors on light glass. There is no left sidebar.

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

Define all tokens as CSS variables in packages/ui and switch them with a data-theme attribute on the root.

## 2. Wallpaper
- Glass panels sit on top of a wallpaper image with backdrop-filter blur.
- Settings: Appearance → Wallpaper = On/Off, choose image (built-in images or upload), blur strength (0–40 px, default 24).
- Default: On, built-in dark landscape for dark mode, built-in light landscape for light mode.
- When Off, the solid bg color is used.

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
- No drop shadows on cards; depth comes from glass and blur.

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

## 7. Dock (main navigation)
- Position: bottom center, 10 px above the window edge, floating.
- Look: glass-strong background, radius 18, padding 6×10, height 60.
- Icons: 36×36 tiles in module colors, radius 10, gap 6, dark icon glyph.
- Order: Dashboard, Tasks, Habits, Notes, Graph, Calendar, Mail, Drive, Projects, Money | divider | AI assistant, Settings.
- Hover: magnification. Size scales up to 1.7× for the icon under the cursor and falls off within 90 px. Built with Motion (formerly Framer Motion).
- Tooltip with the module name above the hovered icon.
- Active module: 4 px dot under its icon.
- Settings: Dock → Auto-hide (default Off), Magnification (default On), Icon size (Small 32 / Medium 36 / Large 44, default Medium).
- Auto-hide: dock slides down out of view; it slides up when the cursor enters the bottom 28 px of the window, and hides 400 ms after the cursor leaves.

## 8. Dashboard layout
- Top row: greeting (22) with date (11) on the left; glass search bar with "Ctrl K" hint on the right.
- Assistant card: glass, full width of the main column, lavender sparkle icon, 1–2 line daily summary, input "Ask or tell me what to do", lavender send button.
- Tile grid under the assistant card (react-grid-layout).
- Activity feed: right column, 190–240 px wide, glass items.
- The dock floats over the bottom; content leaves 80 px bottom padding.

## 9. Keyboard
- Ctrl K: global search and command palette.
- Ctrl 1 to Ctrl 9: Dashboard, Tasks, Habits, Notes, Graph, Calendar, Mail, Drive, Projects.
- Ctrl 0: Money. Ctrl J: open AI assistant. Ctrl , : Settings.

## 10. Mobile (Phase 2)
- Same tokens, colors, tiles, and glass.
- Navigation: bottom tab bar with Dashboard, Tasks, AI assistant, Calendar, More. No magnification on mobile.

## 11. Motion
- Duration 150–250 ms, ease-out.
- Tiles lift 2 px on hover. Dock magnification follows the cursor without delay.
