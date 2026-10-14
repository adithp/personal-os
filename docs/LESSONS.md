# Lessons

Every time something cost a retry or a fix, we record it here so it never happens twice (see `.claude/skills/record-lesson`). Read this file, and the `pitfalls.md` of the skills you will use, before starting any feature.

- **guarded**: an automated guard (test, lint rule, type, script, hook, config) makes the mistake fail loudly.
- **documented**: the prevention is an instruction in a skill's `pitfalls.md` (or CLAUDE.md "Known pitfalls").
- Full entries live in `.claude/skills/<skill>/pitfalls.md`.

| Date | Area | Summary | Status | Where the prevention lives |
|---|---|---|---|---|
| 2026-10 | dev-environment | Cargo cannot write in a folder protected by Windows Controlled Folder Access | documented | dev-environment pitfalls; decision 29 |
| 2026-10 | dev-environment | Moving the repo to another folder failed (Move-Item, permissions on .git) and was reverted | documented | dev-environment pitfalls; decision 29 |
| 2026-10 | dev-environment | Port 3000 was taken by another project's Docker container (ruview) | documented | dev-environment pitfalls; the server fails loudly with EADDRINUSE |
| 2026-10 | dev-environment | .env files must never be read or edited by Claude | guarded | .claude/settings.json deny rules; scripts/repo-guards.test.mjs |
| 2026-10 | dev-environment | Bash commands like sed do not work in the owner's PowerShell | documented | dev-environment pitfalls |
| 2026-10 | dev-environment | Vite reads .env only at startup | documented | dev-environment pitfalls |
| 2026-10 | dev-environment | The Supabase direct connection is IPv6 only | guarded | apps/server/src/config/env.ts (refuses it) and its test |
| 2026-10 | dev-environment | New Supabase projects sign tokens with JWKS, not the old HS256 secret | guarded | apps/server/src/auth/verify-jwt.ts and its tests |
| 2026-10-07 | dev-environment | Oracle Always Free ARM has had no capacity in Mumbai | documented | dev-environment pitfalls; decision 35; docs/DEPLOYMENT.md |
| 2026-10 | dev-environment | TypeScript 7 is not supported by typescript-eslint yet | guarded | scripts/repo-guards.test.mjs (typescript stays 6.0.x); decision 28 |
| 2026-10-09 | dev-environment | Git worktrees branch from the default branch unless baseRef is "head", and only see committed work | guarded | .claude/settings.json worktree.baseRef and scripts/repo-guards.test.mjs; orchestrate-feature |
| 2026-10 | dev-environment | Git Bash rewrites a leading / argument into a Windows path; long heredocs with quotes break | documented | dev-environment pitfalls |
| 2026-10-09 | dev-environment | Windows cannot fully delete agent worktree folders (node_modules locks) | documented | dev-environment pitfalls; orchestrate-feature |
| 2026-10 | dev-environment | Background dev processes are killed under memory pressure | documented | dev-environment pitfalls |
| 2026-10-09 | orchestrate-feature | New agent definitions load only after a session restart | documented | orchestrate-feature pitfalls |
| 2026-10-09 | orchestrate-feature | Agents cannot edit docs, but the docs hook runs on their commits | documented | orchestrate-feature; agent files |
| 2026-10-09 | orchestrate-feature | Reviewer agents have no git and cannot see the diff | documented | orchestrate-feature pitfalls |
| 2026-10-09 | orchestrate-feature | ESLint scanned agent worktrees (each holds a full copy of the repo) | guarded | eslint.config.js ignores .claude/worktrees/; scripts/repo-guards.test.mjs |
| 2026-10 | db-change | Prettier reformatted the generated drizzle meta files | guarded | .prettierignore and scripts/repo-guards.test.mjs |
| 2026-10-09 | db-change | An unapplied migration made the UI show a generic 500 ("column does not exist") | guarded | apps/server/src/lib/schema-guard.ts and tests: startup warning and 503 schema_behind; the desktop shows the message |
| 2026-10 | testing-patterns | PGlite test files time out when many run in parallel | guarded | apps/server and packages/db vitest.config.ts hookTimeout 60 s; scripts/repo-guards.test.mjs |
| 2026-10 | testing-patterns | jsdom lacks ResizeObserver, scrollIntoView, scrollTo, and canvas | guarded | apps/desktop/src/test/setup.ts and scripts/repo-guards.test.mjs |
| 2026-10 | testing-patterns | jsdom ignores keyboard stepping on range inputs | documented | testing-patterns pitfalls |
| 2026-10-09 | testing-patterns | Text queries clash with the Tasks side panel ("Found multiple elements with the text: My tasks") | documented | testing-patterns pitfalls |
| 2026-10 | testing-patterns | Fake timers need userEvent wired to them, and must be restored | documented | testing-patterns pitfalls |
| 2026-10 | ui-design-system | Half-pixel borders look doubled and uneven at 125% and 150% display scaling | guarded | packages/ui/src/styles/tokens.test.ts (whole-pixel insets) |
| 2026-10 | ui-design-system | A transparent Acrylic window cannot be refracted by CSS | documented | docs/DESIGN.md 2b; ui-design-system pitfalls |
| 2026-10 | ui-design-system | Chromium detection rejected HeadlessChrome | guarded | packages/ui/src/liquid-glass support tests |
| 2026-10-09 | ui-design-system | Bright white rings made glass edges look like a white border | documented | ui-design-system pitfalls; docs/DESIGN.md 2b |
| 2026-10-09 | ui-design-system | React lint flags impure calls (Date.now) during render | guarded | eslint react-hooks rules in eslint.config.js |
| 2026-10 | api-route | Fastify hooks apply only to the scope they are added in | guarded | apps/server/src/routes/v1.ts (requireLogin as a function) and the auth tests on every route |
| 2026-10-09 | data-hooks | A failed optimistic change rolled back unrelated cache entries | documented | data-hooks SKILL (snapshot only entries that contain the task) |
| 2026-10-09 | data-hooks | Two quick tag changes overwrote each other | guarded | apps/desktop/src/modules/tasks/detail/task-detail-review-fixes.test.tsx |
| 2026-10-09 | time-and-money | rrule treats dates as floating UTC, which shifts days around midnight India time | guarded | apps/server/src/actions/recurrence.test.ts (00:10 IST and month-end cases) |
| 2026-10-09 | time-and-money | All-day due dates must be stored as the start of the India day | guarded | apps/server/src/actions/tasks.ts (normalises) and its tests |
| 2026-10-09 | time-and-money | Typing a year in a date-time box passes through invalid years | guarded | task-detail tests (draft saved on blur or Enter) |
| 2026-10-08 | docs-sync | Docs drifted from the code (hosting moved from Oracle to AWS in some files only) | guarded | scripts/docs-check.mjs, docs/doc-map.json, .githooks/commit-msg, CI |
| 2026-10-09 | dev-environment | Python in a bash heredoc turns a doubled backslash n into a real newline inside strings | documented | dev-environment pitfalls |
| 2026-10-09 | testing-patterns | HttpError has statusCode, not status | documented | testing-patterns pitfalls |
| 2026-10-09 | testing-patterns | dnd-kit adds a role=status live region, so bare role queries for toasts find several elements | documented | testing-patterns pitfalls; my-tasks/test-utils.ts findToast |
| 2026-10-09 | testing-patterns | Keyboard dragging in jsdom needs mocked layout | documented | testing-patterns pitfalls |
| 2026-10-09 | ui-design-system | dnd-kit gives focus back to the handle after a keyboard drop | documented | ui-design-system pitfalls; my-tasks/tasks-dnd.tsx |
| 2026-10-09 | orchestrate-feature | Two agents built the same drag handle twice and one copy missed the guards | documented | orchestrate-feature pitfalls |
| 2026-10-09 | ui-design-system | Do not add border-[0.5px] next to the glass utilities | documented | ui-design-system pitfalls |
| 2026-10-09 | data-hooks | Two equal positions broke a move with a 400 | guarded | apps/server/src/actions/task-moves.test.ts |
| 2026-10-09 | testing-patterns | Page tests passed alone but timed out in a full run | guarded | apps/desktop/vitest.config.ts |
| 2026-10-09 | testing-patterns | Build the promises of a rejection test lazily | documented | testing-patterns pitfalls |
| 2026-10-09 | dev-environment | A Python edit script without an encoding corrupted non-ASCII text | documented | dev-environment pitfalls |
| 2026-10-12 | time-and-money | chrono en.GB reads "oct 12" as the year 2012 | guarded | apps/desktop/src/modules/tasks/quick-add/parse.test.ts |
| 2026-10-12 | orchestrate-feature | A fresh agent worktree needs pnpm install as its own first command | documented | orchestrate-feature pitfalls |
| 2026-10-12 | time-and-money | The first date of a repeat typed in quick add must follow the same short-month rule as the server | guarded | apps/desktop/src/modules/tasks/quick-add/parse.test.ts |
| 2026-10-12 | time-and-money | chrono marks a lone month name as day 1 with a certain day | guarded | apps/desktop/src/modules/tasks/quick-add/parse.test.ts |
| 2026-10-12 | data-hooks | Never call another setState inside a state updater function | guarded | apps/desktop/src/modules/tasks/quick-add/bar/quick-add-bar-fixes.test.tsx |
| 2026-10-12 | dev-environment | eslint --fix can turn x as T into x! and break two other lint rules | documented | dev-environment pitfalls |
| 2026-10-13 | testing-patterns | A query added on mount broke the failNext error tests | guarded | apps/desktop/src/test/fake-api.ts |
| 2026-10-13 | testing-patterns | Dialog and page tests find several elements of the same role | documented | testing-patterns pitfalls |
| 2026-10-13 | ui-design-system | useSortable values read in render trip react-hooks/refs | documented | ui-design-system pitfalls |
| 2026-10-13 | new-action | An undo must relink what still exists and re-check the same limits as the forward action | guarded | apps/server/src/actions/tag-management.test.ts |
| 2026-10-13 | new-action | Read-then-write limits (12 favorites, same view) need a lock | documented | new-action pitfalls; docs/features/tasks-redesign.md |
| 2026-10-13 | dev-environment | A Python edit script in text mode turned LF into CRLF | guarded | prettier --check in pnpm lint |
| 2026-10-13 | testing-patterns | A test that races a short fake delay is flaky on a busy machine | guarded | apps/desktop/src/modules/tasks/quick-add/bar/quick-add-bar-fixes.test.tsx |
| 2026-10-13 | testing-patterns | A test that fakes the clock must sign its login token after setting the time | documented | testing-patterns pitfalls |
| 2026-10-13 | testing-patterns | failNext hit the first request of the page, not the one under test | guarded | apps/desktop/src/test/fake-api.ts |
| 2026-10-13 | testing-patterns | Vitest passed but the real server crashed on a CommonJS named import (rrule) | guarded | apps/server/src/startup-imports.test.ts |
| 2026-10-14 | new-action | Move links must not delete links to deleted goals; limits need the lock helper | guarded | apps/server/src/actions/goals.test.ts |
| 2026-10-14 | db-change | New tables need explicit privileges (Supabase stops auto-granting on 30 Oct 2026) | documented | db-change pitfalls; docs/design/research/realtime.md |
| 2026-10-14 | ui-design-system | A fixed overlay inside a glass panel needs a portal | guarded | apps/desktop/src/modules/notes/list/confirm-dialog.tsx |
| 2026-10-14 | testing-patterns | Mock hooks with their real return shape; TipTap setEditable emits update | guarded | apps/desktop/src/modules/notes/editor/note-editor-pane.test.tsx |
| 2026-10-14 | testing-patterns | TipTap input rules and floating menus in jsdom | guarded | apps/desktop/src/modules/notes/editor/wikilink/wikilink-menu.test.ts |
| 2026-10-14 | data-hooks | invalidateQueries is ignored by a query still on its first fetch (no data yet); cancel first | guarded | apps/desktop/src/modules/money/money-queries.test.tsx |
| 2026-10-14 | testing-patterns | Server test helpers that run raw SQL must be named *.test.ts (the no-direct-database rule scans all other files) | guarded | apps/server/src/actions/money-test-utils.test.ts |
| 2026-10-14 | db-change | A generated migration can get a `when` older than the previous one (drizzle would skip it) | guarded | apps/server/src/lib/schema-guard.test.ts |
| 2026-10-14 | testing-patterns | A run-time require is missing in the production bundle (server crashed on AWS) | guarded | apps/server/src/startup-imports.test.ts |

