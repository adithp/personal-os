# Tasks Feature 2: Board view and drag and drop (plus two small cleanups)

This continues from: "Checked, working. Tasks Feature 1 tested. next". Feature 1 is approved (ROADMAP.md is ticked). Build ONLY what is written here. Do not start Feature 3 or any later feature. Do not start the design-consistency job from here (I send it separately; if `pnpm design:check` already exists when you start, run it too).

I start this with `/orchestrate-feature Tasks Feature 2` and give you this file as the spec. Follow the orchestrate-feature skill.

## 0. Decisions already approved (do not ask again)
- Decision 52: at most 5 agents at once.
- Decision 53: charts use Recharts 3.10.1 (not needed in this feature).
- Decision 54: use `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2 (exact versions, no `^`). You may install these three in apps/desktop. Install nothing else.

## 1. Cleanup first (small, internal, one commit each, no stop)
1. The status named `doing` shows as "In progress" everywhere in the UI, including the detail panel (it said "Doing"). The stored value stays `doing`. Update tests and docs/features/tasks.md.
2. The dashboard "Today's tasks" tile uses real tasks (due today by India calendar day, not done, not archived; overdue first), using the existing task hooks and fake API in tests. Keep its look.
3. Do NOT remove `tag` from ENTITY_TYPES. It is a Postgres enum, so removing it needs a migration and gains nothing. Mention it as left open.

## 2. Feature 2: what to build
**Server** (`server-dev`): the action `tasks.move` (permission: write, undoable) in `apps/server/src/actions/task-moves.ts`, route in `routes/task-moves.ts`, tests.
- Input: task id, optional new status, optional new due date (or "all-day today"), and optional `beforeId` / `afterId` (the neighbours it lands between).
- The position is a number between its neighbours (the schema already has `position`, a double). If neighbours are too close, rebalance that group's positions in the same transaction.
- Moving into `done` goes through the same path as completing (recurring copy and the blocked check; the blocked check is Feature 3, so use the existing hooks in tasks.ts and do not edit it). A refused move returns the server's message.
- Moving out of `done` reopens the task (status `todo` unless a status is given).
- The undo descriptor restores the old status, due date, and position.
- Tests: every case above, and that another user's task can never be moved (user-scope).
- No migration should be needed. If you think one is needed, stop and tell me.

**Contract** (orchestrator, committed first): `resolveDrop()` as a pure function with tests (a drop target plus the dragged task gives the change to send), the dnd-kit setup shared by both views, hook `useMoveTask` with optimistic patch and the Undo toast, mock API support, stub files, and `features.ts` board true when the Board is ready.

**Board view** (`ui-dev` A, `modules/tasks/board/**`): three columns To do, In progress, Done, using the same card as Cards view. Column header with count. Drag between columns changes the status; drag inside a column reorders. Drop shows a quiet insertion line. Keyboard dragging works (space to lift, arrows, space to drop, esc to cancel) with spoken announcements. Empty column shows a quiet hint.

**Cards and List** (`ui-dev` B, `modules/tasks/my-tasks/**`):
- A drag handle appears on hover (Cards) and on focus.
- Reorder inside a section works only when Sort is Manual. When Sort is not Manual, dragging to reorder is off and a hint says "Sort is not Manual, so reordering is off".
- Drop on **Today** sets the due date to today (keeps an existing time, otherwise all-day). Drop on **Upcoming** opens a date picker (cancel puts the card back). **Overdue** accepts no drops. Drop on **Completed** completes the task (a refused move shows the error toast and the card goes back). Dragging a completed card out of Completed reopens it.
- Subtasks are not draggable in this feature.
- Every move shows the Undo toast.

Follow docs/DESIGN.md (tokens, glass, module colors, dark and light, minimal). Use the shared components.

## 3. Rules
- Ask me if anything is unclear, even in auto mode. Agents ask nothing: they stop and report questions to the orchestrator.
- Never read or edit .env files. Never run `pnpm db:migrate`.
- Docs must match the code (docs-sync): tasks.md, tasks-redesign.md Status, API.md, AI_SYSTEM.md, DESIGN.md, ROADMAP only after my "next".
- Run reviewers (code, design, security, docs), fix findings, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm docs:check`.
- Stop only when I can see and test Feature 2. Then send the feature report in the feature-report format (including "Docs updated" and "Lessons") and write: "Feature complete. Waiting for your check. Reply 'next' to continue or tell me what to fix."
- Do NOT: start Feature 3, add any other library, build Repeat or Blocked-by UI, or touch the Inbox/Reporting/Goals pages.

## 4. What I will test (so the report covers it)
Board with all three columns, drag by mouse and by keyboard, drops on every section in Cards and List, Sort not Manual, undo after each move, dark and light mode, the three cleanups.
