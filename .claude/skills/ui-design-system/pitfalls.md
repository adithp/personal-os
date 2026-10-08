# Pitfalls: ui-design-system

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10: Half-pixel borders look doubled and uneven at 125% and 150% display scaling
- Symptom: The glass edge looked doubled on the owner's screen
- Cause: 0.5 px borders and 1.5 px insets are rendered unevenly at fractional DPI
- Fix: Liquid edges use whole pixels; there is no separate border in Liquid mode
- Prevention: guarded, packages/ui/src/styles/tokens.test.ts (whole-pixel insets)

### 2026-10: A transparent Acrylic window cannot be refracted by CSS
- Symptom: Liquid Glass showed no desktop bending in Transparent mode
- Cause: Windows composites the Acrylic below the web page; backdrop-filter cannot read it
- Fix: Liquid refraction bends only what the page draws; in Transparent mode it shows rim, shine, and glow
- Prevention: documented, docs/DESIGN.md 2b; ui-design-system pitfalls

### 2026-10: Chromium detection rejected HeadlessChrome
- Symptom: Liquid Glass fell back to Simple in headless Edge
- Cause: The user-agent regex required a word boundary before "Chrom"
- Fix: Detect with /Chrom(e|ium)\/\d+/
- Prevention: guarded, packages/ui/src/liquid-glass support tests

### 2026-10-09: Bright white rings made glass edges look like a white border
- Symptom: The owner saw a white outline around cards and buttons in the real app
- Cause: The Liquid edge used light rim and ring colors
- Fix: Quiet edge: faint hairline, soft bottom edge, inner glow; no bright rim
- Prevention: documented, ui-design-system pitfalls; docs/DESIGN.md 2b

### 2026-10-09: React lint flags impure calls (Date.now) during render
- Symptom: "Cannot call impure function during render"
- Cause: Calling Date.now() in a hook body
- Fix: Compute it once in a useState initializer (or outside render)
- Prevention: guarded, eslint react-hooks rules in eslint.config.js

### 2026-10-09: dnd-kit gives focus back to the handle after a keyboard drop
- Symptom: Focus jumped away from the date picker opened by a drop, and a moved card could not be refocused
- Cause: dnd-kit restoreFocus runs after a frame, and a card that changes section gets a new sortable id
- Fix: accessibility.restoreFocus is false and the page keeps focus itself (my-tasks/tasks-dnd.tsx)
- Prevention: documented, ui-design-system pitfalls

### 2026-10-09: Do not add border-[0.5px] next to the glass utilities
- Symptom: A popup got a doubled edge at 125% and 150% display scaling
- Cause: glass and glass-strong already set the whole-pixel border; a hand-written half-pixel border overrides it
- Fix: Remove the extra border classes (also removed from the My tasks menus)
- Prevention: documented, ui-design-system pitfalls
