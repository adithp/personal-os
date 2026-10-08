# Tokens and utilities

Defined in `packages/ui/src/styles/tokens.css` (values per theme) and `index.css` (Tailwind names and `@utility` classes). The dark and light blocks must define the same variable names; `tokens.test.ts` enforces this.

| Use | Tailwind class | CSS variable |
|---|---|---|
| Page background | `bg-bg` | `--bg` |
| Glass panel | `glass` utility (`rounded-card glass`) | `--glass`, `--glass-border`, blur from `--glass-blur` |
| Dock and strong panels | `glass-strong` | `--glass-strong` |
| Input background | `bg-input` | `--input-bg` |
| Text | `text-fg`, `text-fg-secondary`, `text-fg-muted` | `--text-primary`, `--text-secondary`, `--text-muted` |
| Text on pastel | `text-on-tile` | `--text-on-tile` |
| Errors | `text-danger` | `--danger` |
| Accent (lavender) | `bg-accent`, `text-accent`, `ring-accent` | `--accent` |
| Module color | `moduleColorVar('tasks')` (inline style) | `--module-tasks` … |
| Type sizes | `text-page` 22, `text-section` 16, `text-tile-title`/`text-body` 13, `text-small` 11 | |
| Radii | `rounded-card` 16, `rounded-control` 10, `rounded-chip` 8 | |

Utilities: `focus-ring` (visible focus), `glass`, `glass-strong`, `liquid-tile`, `liquid-input`, `liquid-hover` (Liquid Glass, only meaningful when the Liquid effect is on).

Glass modes: `html[data-glass]` is `liquid`, `simple`, or `off`; the mode variables (`--g-*`) are inherited custom properties. Use the utilities and never write `backdrop-filter` or box-shadows yourself.

Rules of thumb
- If a color you need is not a token, add the token (both themes) instead of using a literal.
- Use whole-pixel edges (1px, 2px) for hairlines; half-pixel borders look doubled at 125% and 150% display scaling (see pitfalls).
- Pastel text and icons need the 3:1 contrast check in light mode (the yellow priority flag is borderline).
