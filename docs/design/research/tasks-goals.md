# Research memo: Tasks Feature 8, Goals

Date: 2026-10-13. Author: research agent (decisions delegated by the owner, decision 62; to be reviewed later).
Mockup: `docs/design/mockups/tasks-goals.html` (open it in a browser; the buttons at the top switch dark and light and the screens: list, detail, the "Mark as achieved?" prompt, and the empty states).

## 1. What is already decided (not redone here)
- Goals are linked to tasks through the `links` table, with a new `goal` entity type (docs/features/tasks-redesign.md "Decisions", CONTEXT.md section 4).
- Progress counts top-level tasks only.
- When all linked tasks are done the app asks "Mark as achieved?"; it never changes the goal's status by itself.
- Goals is a page inside Tasks (`/tasks/goals`, side panel row "Goals", `TASK_FEATURES.goals`). Ownership for Feature 8: `server-dev` owns `actions/goals.ts`, `routes/goals.ts` and tests; `ui-dev` A owns `modules/tasks/goals/list/**`; `ui-dev` B owns `modules/tasks/goals/detail/**` (tasks-redesign.md "Build order").

## 2. What the research found
Every point comes from a page I opened. Points seen only in search-result summaries are marked **unverified**.

### How other apps do goals
- **Asana Goals** [S1]. Progress is either Automatic or Manual. Automatic progress can come from sub-goals, projects or tasks; with tasks as the source, "progress will be calculated based on the completion of the connected tasks". Up to 100 items can drive automatic progress. A separate "Related work" section lists tasks and projects that are relevant but do not count toward progress (120 items at most). Status is set by hand in a status update: On track, At risk, Off track. Closing a goal is a separate step: you grade it as Achieved, Partial, Missed or Dropped. Owners get a reminder near the end of the goal's period to grade and close it. Nothing in the article says Asana closes a goal automatically when progress hits 100%.
- **Asana feature page** [S2]: a goal has an owner, a time frame (quarter, half, year or custom) and a status. Connected projects, portfolios and tasks update progress as work finishes.
- **ClickUp Goals** [S3]: a goal is made of Targets: Number, True/False, Currency, or Task (one task, a subtask or a whole list). When a task is attached to a target, the task's detail shows a badge with the goal's name. The goal percentage updates as targets change.
- **Linear projects** [S4, S5, S6]: statuses Backlog, Planned, In progress, Completed, Canceled. A project has start and target dates of chosen precision. An issue can belong to only one project at a time. Health (On track, At risk, Off track) is written by hand in updates [S5]. Milestone progress starts counting when an issue is started and grows when it is completed [S6] (partial credit for "in progress"). That a project does not complete itself when all issues are done is **unverified** (only in third-party summaries).
- **Things 3** [S7, S8, S9]. A project is for "any big goal", with to-dos, notes and a deadline [S8]. Completing a project that still has open to-dos asks what to do with them (release notes mention the options pre-selected "when completing a project or heading with incomplete to-dos") [S9]. Cancelling is separate from completing and shows an X instead of a check, so the record shows what was given up rather than done [S10]. The project progress pie can mislead: if a project only holds the next actions, it looks almost done while 20 more steps live elsewhere [S11].
- **Todoist and TickTick**: no separate goal object. People use a project per goal, and TickTick's habits for repeated goals (**unverified**: only third-party comparison summaries).

### UX evidence
- **Goal-gradient effect** [S12]: people speed up as they get near a goal; a clear sign of progress helps. The same page suggests "artificial progress" to motivate, which we do not use (an honest count matters more in a personal tool).
- **NN/g progress indicators** [S13]: showing the number of steps done ("x of y") helps people judge; progress that stalls or moves in a strange way hurts trust.
- **NN/g confirmation dialogs** [S14]: ask only before serious, destructive actions, and say exactly what will happen; offering Undo is better than asking.
- **Quiet celebrations** [S15]: Asana users call the unicorn celebrations "childish" and "infantilizing" and ask how to turn them off. Animations can also freeze the screen.
- **Postgres** [S16]: if `ALTER TYPE ... ADD VALUE` runs inside a transaction, the new value cannot be used until the transaction commits. Adding it with `IF NOT EXISTS` is safe to repeat.

### Design references
- The Chrome browser tool worked for one page (the Asana help article, which I read in full) and then disconnected ("Selected Chrome extension disconnected", and no browser was listed after that). So **I could not view any Dribbble, Behance or Mobbin screenshots** for this feature. Text fetches of Dribbble and Behance pages came back empty or 403.
- From search-result text only (**unverified, not viewed**): Dribbble "Goal Tracking App" by Diana Larussa (a goal dashboard where each goal shows progress, a deadline and an edit action) [D1]; Dribbble tag pages "goal" and "goal-progress" [D2]; Behance "Visualize – Goal Setting App" (progress pies and a color per goal) [D3].
- Because of this the layout below is built from the product sources above and our own existing Tasks patterns (task cards, Inbox rows, Reporting stat cards, detail panel), not from a viewed design reference. The owner should compare it with a real reference when checking.

**Chosen pattern:** Asana's "goal with connected tasks and a separate close step" [S1], with Linear's "one container per item" rule [S4] and Things' "complete vs cancel" record [S10]. Drawn in our tokens: a grid of glass goal cards (like Cards view), and a detail page that reuses the task row and the task detail panel.

## 3. Decisions
Confidence: high = several sources plus our docs; medium = one source or our own consistency; low = my judgement.

**D1. Data model: a `goals` table, and `goal` in the entity type enum.**
- Choice: table `goals` (packages/db/src/schema/goals.ts): `id` (same as its entities row, composite foreign key `(id, user_id)` to entities with cascade, `unique(id, user_id)`), `user_id`, `title` (text, 1 to 200), `description` (text, nullable, up to 20,000: the notes), `target_at` (timestamptz, nullable: the start of the target day in India time, date only, like an all-day due date), `status` (enum `goal_status`: `active`, `achieved`, `dropped`; default `active`), `closed_at` (timestamptz, nullable: when it was achieved or dropped; cleared when made active again), `created_at`, `updated_at`, `deleted_at`. Indexes: user, and (user, status). RLS policy `goals_own_rows`. `updated_at` trigger. Shared constant `GOAL_STATUSES` in `packages/shared/src/goals.ts`; `ENTITY_TYPES` gets `'goal'` at the end. Renaming a goal updates `entities.title`; soft-deleting it also soft-deletes its entities row (same rules as tasks).
- No color, icon or position. Goals use the Tasks yellow; the list has a fixed order (D5).
- Reason: Asana and Linear goals/projects have a title, description, target date and a status with an end state [S1, S4]; our soft delete and entity rules (docs/DATABASE.md) apply unchanged. A date-only target matches how people state goals ("by December") and reuses the all-day rule (decision 45).
- Rejected: owner, time period, health status (On track/At risk) and numeric targets (team and OKR features [S1, S3]; a single user does not need them); a per-goal color (one more picker; a pastel per goal would clash with the module colors); storing progress in a column (it would drift; compute it, D3).
- Confidence: high for the columns, medium for "no color".

**D2. Linking: `links` with relation `belongs_to`, source = task, target = goal; one goal per task; only top-level tasks.**
- Choice: a link `task → goal` with the existing relation `belongs_to` (no change to `link_relation`). A task can belong to at most one goal: linking a task that is already in another goal moves it (the old link is soft-deleted in the same step; undo moves it back). Subtasks cannot be linked (400 "Link the parent task instead."). Unlinking soft-deletes the link. The server always checks that the target entity has type `goal`, because Step 5 projects will also use `belongs_to`.
- Reason: Linear allows one project per issue [S4] and it keeps progress simple (no task counted in two goals). "Progress counts top-level tasks only" is already decided; refusing subtasks makes that rule visible instead of silently ignoring them. Reusing `belongs_to` avoids a second enum change.
- Rejected: many goals per task (double counting, a harder picker; can be added later by dropping the check); a new relation `contributes_to` (a second `ALTER TYPE`, no real gain); a `goal_id` column on tasks (breaks the decided links approach).
- Confidence: medium (one goal per task is a judgement; see open point 1).

**D3. Migrations (by the db-change skill; the owner runs `pnpm db:migrate`).**
- `0008_goal_entity_type` (hand-written, `drizzle-kit generate --custom`): `ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'goal';`. Nothing in this run uses the value (Postgres cannot use a new enum value before commit [S16]), so the next migrations only create the table. If `drizzle-kit generate` writes the `ALTER TYPE` itself after `'goal'` is added to `ENTITY_TYPES`, keep its file instead of a custom one; either way the second `generate` must say "No schema changes".
- `0009_goals_table` (generated): enum `goal_status`, table `goals`, foreign keys, indexes, RLS, policy.
- `0010_goals_updated_at_trigger` (hand-written): `goals_set_updated_at` using `public.set_updated_at()`.
- Tests (packages/db): migration list and table list in `schema.test.ts`, the truncate lists, a goal is its entity (cascade), RLS own rows with `asRole`, anon has no access, the trigger, a `belongs_to` link task → goal is accepted.
- Message to the owner: apply 0008, 0009, 0010; check in Supabase that `goals` exists with RLS on and policy `goals_own_rows`, enum `entity_type` contains `goal`, enum `goal_status`, trigger `goals_set_updated_at`, and the row count of `drizzle.__drizzle_migrations` grew by 3. Until then the app shows "Database update needed: run pnpm db:migrate".
- Confidence: high.

**D4. Progress formula.**
- Choice: for each goal, count the linked tasks where the link is live, the task is top-level and not deleted, and the task is either not archived or done.
  - `total` = that count. `done` = those with status `done`. In progress counts as not done (no partial credit).
  - Archived open tasks are left out (parked, like Overdue now in Reporting); an archived done task still counts as done (archiving after finishing must not lower progress).
  - Deleted tasks are left out; restoring a task brings it back.
  - Tasks added later raise `total`, so the percentage can go down. That is honest; the card shows "3 of 8 tasks" first and the percent second so the change is understandable.
  - A repeating task counts once: when completed, the next copy is not linked to the goal (same as blocker links, which are not copied; tasks.md).
  - A goal with no counted tasks has `total = 0`: no bar and no percent, the text "No tasks yet".
- Percent = `round(done / total * 100)`, shown only when `total > 0`. Computed by the server in code from rows read through `scope.select` (no raw SQL, as Reporting), returned as `progress: { done, total }`.
- Reason: Asana's task-based progress is the completion of connected tasks [S1]; NN/g favours "x of y" [S13]; Linear's partial credit for started work [S6] is hard to explain in one line, so it is left out. Hiding the bar at zero tasks avoids a misleading 0% (Things' pie problem [S11]).
- Rejected: weighting by priority or subtasks; manual percent (Asana Manual mode [S1]) for v1; counting archived open tasks (they would keep a goal from reaching 100% forever).
- Confidence: high for done/total and deleted; medium for the archived and repeat rules.

**D5. The goals list page (`/tasks/goals`).**
- Choice: header "Goals" (22 semibold) with the summary "3 active" (muted, small), a segmented control **Active | Achieved | Dropped** (Active by default, not saved), and a secondary button "New goal" (plus icon). Below, a grid of glass goal cards (columns at least 260 px, radius 16, padding 16, lifts 2 px on hover like task cards, not with reduced motion). The card's title is a link to the detail page, stretched so the whole card is clickable. The "Mark as achieved" button sits above that link layer, because a button inside a link is not valid HTML. The mockup simplifies this. Each card has:
  - a 26 px round icon square in Tasks yellow with a dark Tabler `target` icon, then the title (13 medium, 2 lines);
  - the progress row: a 5 px bar (Tasks yellow on the input background) and "3 of 8 tasks" (11 muted) with "38%" at the right; or "No tasks yet" with no bar;
  - the footer (11 muted): the target "By 31 Dec" (with the year when not this year; red danger text "Target passed · 2 Sept" when the day is before today in India time and the goal is active), or "No target date";
  - when every counted task is done and the goal is active: a small line "All tasks done" with a check icon and a text button "Mark as achieved" (D8);
  - Achieved cards show "Achieved 13 Oct" with a check-circle icon; Dropped cards show "Dropped 13 Oct" with an x-circle icon; both at full opacity (they are history, not disabled).
- Order: Active by target date (soonest first, no date last), then by created date; Achieved and Dropped by `closed_at`, newest first.
- Reason: a person has few goals, and progress bars read best in cards (the Tasks Cards view is the default too). Achieved/Dropped as separate tabs follows Asana's closed states [S1] and Things' Logbook [S9] while keeping the active list short.
- Rejected: rows (fine for many goals; with 3 to 10 goals cards use the space better); one list with all statuses (closed goals push the active ones down); an "Overdue" style for the whole card (one red line is enough).
- Confidence: medium.

**D6. Creating, editing, dropping and deleting.**
- New goal: "New goal" (or N on the list page) opens a small glass-strong dialog (400 px, focus trap, Esc closes): Title (required, focus first), Target date (optional date box, India day), buttons "Create goal" (primary) and "Cancel". Enter in the title creates. After creating, the app opens the new goal's page. Toast "Goal created." with Undo.
- Editing happens on the detail page: the title is an inline text box (saves on blur or Enter; empty is refused with "Add a title"), the target date has a date box with a clear button, the notes box saves on blur (as task notes).
- The "more" menu on the detail page header: **Mark as achieved** (only when active), **Drop goal** (only when active), **Make active again** (only when achieved or dropped), **Delete goal**.
  - Achieved and dropped: no question; toast "Goal achieved." or "Goal dropped." with Undo. Linked tasks are not touched (unlike Things, which asks what to do with open to-dos [S9]; our goal does not own the tasks, they stay in My tasks).
  - Delete: no question (the button is the confirmation, decision 38) and the toast "Goal deleted." with Undo; the app goes back to the list. The goal and its entity row are soft-deleted; its links stay so that Undo restores everything; the tasks stay. While deleted, the goal is hidden everywhere and its tasks show no goal.
- Drop vs delete: dropped keeps a record of what you gave up (Things' cancel [S10], Asana's Dropped [S1]); delete is for mistakes.
- Reason: NN/g: Undo is better than a question for actions that can be reversed [S14].
- Confidence: high.

**D7. The goal detail page (`/tasks/goals/$goalId`).**
- Layout, top to bottom, in the main column (the task detail panel opens on the right as in My tasks):
  1. A quiet back link "Goals" (chevron-left, 11 muted).
  2. Header row: the 26 px yellow target square, the title (22 semibold, editable inline), a status chip when not active ("Achieved" / "Dropped", input-colored chip with an icon), and at the right a 30 px "more" icon button (D6 menu).
  3. A meta line (11 muted): "By 31 Dec" with a date button to change it ("Set a target date" when empty).
  4. A progress card (glass, radius 16): the number "3 of 8" (30 semibold) with "tasks done" (11 muted) and the percent at the right, the 5 px bar under it; or "No tasks yet" and one muted line "Link tasks to see your progress." when `total = 0`.
  5. The "Mark as achieved?" prompt (D8) when it applies, directly under the progress card.
  6. Notes: a borderless text box "Add notes…" (13, grows), saved on blur.
  7. Tasks: a glass card with the heading "Tasks" (16) and two actions at the right: "Add tasks" (link existing) and an inline "Add a task to this goal…" input at the top of the card (Enter creates a new task linked to the goal; plain title only, no quick-add parsing). Then the open tasks as `TaskRow`s (checkbox, title, due label, priority flag; manual order of My tasks), and a collapsed "Done (3)" group. Each row shows a quiet "Remove from goal" icon button (unlink icon) on hover or focus; clicking the row opens the task detail panel. Archived open tasks are listed under the Done group in a muted "Archived (1)" group so nothing silently disappears.
- Reason: Asana's goal page has progress, status and connected work [S1, S2]; Things keeps notes and a deadline on the project [S8]. Reusing `TaskRow` and the detail panel keeps one task look across Tasks.
- Rejected: a separate "Related work" list that does not count (Asana [S1]; too much for one user); a chart of progress over time (Linear graphs [S4]; later, maybe with Reporting); editing tasks inline on the goal page beyond the checkbox.
- Confidence: medium.

**D8. The "Mark as achieved?" prompt.**
- Shows only when: the goal is active, `total >= 1`, and `done == total`, and it was not dismissed for this same `total` (see below).
- Where: on the detail page under the progress card, as a glass row with a check-circle icon in Tasks yellow, the text "All 8 tasks are done. Mark this goal as achieved?", a primary button "Mark as achieved" and a secondary button "Not yet". On the list card, a smaller form (D5). It is not a modal and has no sound or animation (Asana users dislike forced celebrations [S15]).
- "Not yet" hides it on this device until the number of counted tasks changes (saved in localStorage `personal-os.tasks-goals` as goal id → dismissed total). Adding a new task then completing it shows it again.
- After "Mark as achieved": the status becomes achieved, the progress card shows a quiet line "Achieved 13 Oct" with a check icon, the toast "Goal achieved." with Undo. Screen readers hear the toast.
- When the last task is completed elsewhere (My tasks, Board, Inbox), nothing extra appears there; the prompt waits on the Goals page. (Keeps every other page unchanged.)
- Reason: Asana and (by third-party accounts) Linear leave closing to the person [S1]; Things asks only when it is unclear [S9]. The goal-gradient effect [S12] says showing "8 of 8" is motivating already; the prompt just makes the last step one click.
- Rejected: a dialog after completing the last task anywhere (interrupts the task flow); confetti or an animation [S15]; changing status automatically (already rejected by the owner).
- Confidence: medium.

**D9. Linking tasks.**
- From the goal page, "Add tasks" opens a glass-strong popover (320 px) with a search box and a list of open, top-level, not archived tasks (title and, muted, the current goal if any: "In: Learn Rust"). Click or Enter links one and keeps the popover open (a check shows on linked ones; clicking again unlinks). Esc or outside click closes it. Empty search result: "No matching tasks.". No tasks at all: "No open tasks. Type above to add one to this goal.".
- From the task detail panel, a new row **Goal** after Tags: shows the goal name as a chip (click opens the goal page) or "No goal" in muted text; the chevron opens a menu of active goals (search above 8) with "No goal" at the top. Choosing one links (or moves); "No goal" unlinks. Subtasks show the row read-only with the parent's goal ("Follows the parent task").
- Every link change shows a toast with Undo: "Added to Learn Rust.", "Removed from Learn Rust.", "Moved to Learn Rust.".
- From the goal page, "Add a task to this goal…" creates through `tasks.create` with `goalId`.
- Reason: ClickUp shows the goal's name in the task detail [S3]; Asana connects work from the goal page [S1]; both directions are needed (planning starts from the goal, triage starts from the task).
- Rejected: multi-select with checkboxes and an "Add 5 tasks" button (one more mode; the popover staying open does the same); drag tasks onto a goal (no goal targets in My tasks).
- Confidence: medium.

**D10. Server actions, routes and undo.** (shared definitions in `packages/shared/src/goals.ts`)
| Action | Permission | Input | Undo |
|---|---|---|---|
| `goals.list` | read | `{ status?: 'active' \| 'achieved' \| 'dropped' }` | – |
| `goals.get` | read | `{ id }` | – |
| `goals.create` | write | `{ title, description?, targetAt? }` | `goals.delete` |
| `goals.update` | write | `{ id, title?, description?, targetAt? }` (at least one) | `goals.update` with old values (null when nothing changed) |
| `goals.setStatus` | write | `{ id, status }` | `goals.setStatus` with the old status and old `closedAt` restored (null when unchanged) |
| `goals.delete` | destructive | `{ id }` | `goals.restore` |
| `goals.restore` | write | `{ id }` | `goals.delete` |
| `goals.setTaskGoal` | write | `{ taskId, goalId: uuid \| null }` | `goals.setTaskGoal` with the old goal (null when unchanged) |
- A goal as returned: `{ id, title, description, targetAt, status, closedAt, createdAt, updatedAt, progress: { done, total } }`.
- `tasks.create` gains `goalId?` (links in the same transaction; its undo stays `tasks.delete`). `tasks.list` gains a `goalId` filter (all linked top-level tasks of that goal, including done and archived, so the page can group them). The task as returned gains `goal: { id, title } | null` (loaded like `blockedBy`).
- Routes (all under `/api/v1`, login required): `GET /goals?status=`, `GET /goals/:id`, `POST /goals`, `PATCH /goals/:id`, `POST /goals/:id/status`, `DELETE /goals/:id`, `PUT /tasks/:id/goal` (body `{ goalId }`); restore runs through `POST /undo`. Errors: 404 `not_found` for a missing or deleted goal or task; 400 for a subtask ("Link the parent task instead."). Setting the status a goal already has is not an error: it returns the goal with undo null.
- Limit: at most 500 counted tasks per goal (the default task page size); linking more answers 409 "A goal can have at most 500 tasks.". Asana's limit is 100 [S1]; 500 matches our list size.
- Reason: rule 1 (one action registry); the permission levels follow AI_SYSTEM.md (only delete is destructive, decision 38). One `setStatus` action keeps achieve, drop and reopen symmetric; one `setTaskGoal` covers link, unlink and move with an exact undo.
- Rejected: separate `goals.achieve`, `goals.drop`, `goals.reopen` (three actions with the same body); `goals.linkTasks` with lists (undo of a partial move is complex).
- Confidence: high for the shape, medium for the 500 limit.

**D11. Empty, loading and error states.**
- List, never had a goal: centered quiet glass card: 40 px round input-colored circle with a muted `target` icon, "No goals yet" (16 medium), "A goal groups the tasks that move you toward something bigger." (muted), button "New goal". (NN/g three parts, as in the Inbox memo.)
- Achieved tab empty: "No achieved goals yet" (one muted line). Dropped tab empty: "No dropped goals".
- Detail, no tasks: the progress card says "No tasks yet" and the Tasks card shows the inline input and "Add tasks".
- Goal not found or deleted: "This goal was deleted or does not exist." with a "Back to goals" button.
- Loading: the muted line "Loading goals…" (list) or "Loading goal…" (detail), as My tasks. Error: a glass card with role alert, the server's message or "Could not load your goals.", and "Try again". Schema not migrated: the existing 503 message.
- Confidence: high.

**D12. Keyboard (page-scoped, no Ctrl keys, same guards as My tasks).**
- List: N opens "New goal", arrow keys move between cards (left, right, up, down in the grid), Enter opens, ? help.
- Detail: N focuses "Add a task to this goal…", Space completes the focused task row, Enter opens it in the detail panel, Delete removes it from the goal (with Undo; it does not delete the task), Esc closes the detail panel, then a second Esc goes back to the list. ? lists these keys under "Goals".
- Delete removing the link instead of deleting the task is deliberate: on this page a row means "this task in this goal".
- Confidence: medium (Delete meaning "remove from goal" differs from My tasks; see open point 4).

**D13. Out of scope (not built in Feature 8).**
Sub-goals, numeric or money targets (Money has `savings_goals`), health status (On track, At risk), progress charts over time, goal reminders near the target date, many goals per task, goals on the Overview page or dashboard, a goal filter in My tasks, goal tags or colors, sharing, AI suggestions for goals (Step 3 can call the actions), search (comes with full-text search).

## 4. Data and API outline
- `packages/shared/src/goals.ts`: `GOAL_STATUSES = ['active', 'achieved', 'dropped']`, `GOAL_TITLE_MAX = 200`, `GOAL_DESCRIPTION_MAX = 20000`, `MAX_TASKS_PER_GOAL = 500`, `goalSchema`, `goalProgressSchema { done, total }`, `createGoalInput`, `updateGoalInput`, `setGoalStatusInput`, `goalIdInput`, `listGoalsInput`, `setTaskGoalInput`, `goalActions` (D10), helper `goalPercent(progress)` and `canMarkAchieved(goal)`.
- `packages/shared/src/entities.ts`: `ENTITY_TYPES` + `'goal'`.
- `packages/shared/src/tasks.ts`: `taskSchema.goal`, `createTaskInput.goalId`, `listTasksInput.goalId`.
- `packages/db/src/schema/goals.ts` (+ export in `schema/index.ts`), migrations 0008 to 0010.
- Server: `apps/server/src/actions/goals.ts` (all goal actions plus `loadGoalProgress(scope, goalIds)` and `loadTaskGoals(scope, taskIds)`), registered in `actions/index.ts`; `apps/server/src/routes/goals.ts` (incl. `PUT /tasks/:id/goal`), mounted in `routes/v1.ts`; `actions/tasks.ts` calls `loadTaskGoals`, links on create with `goalId`, and filters by `goalId`.
- Desktop: `modules/tasks/goals/goals-queries.ts` (`useGoals(status)`, `useGoal(id)`, `useGoalActions()`; keys under a `GOALS_KEY`, and task changes also invalidate goals because progress depends on tasks), `goals/prompt-store.ts` (the "Not yet" dismissals), `goals/list/**`, `goals/detail/**`, routes `routes/_app/tasks/goals.tsx` (list) and `routes/_app/tasks/goals.$goalId.tsx` (detail), `detail/goal-section.tsx` (the Goal row in the task detail panel), `features.ts` (`goals: true`), `test/fake-api.ts` (goal routes).
- packages/ui: `ProgressBar` gains an optional `tone` (`'tile'` default, `'glass'` = Tasks yellow fill on `--input-bg`), so the bar is visible on dark glass (the tile style is dark on dark there).
- Docs: DATABASE.md (goals table, `goal` entity, the task → goal link), AI_SYSTEM.md (goal actions and undo), features/tasks.md (Goals rules), tasks-redesign.md (status, Feature 8 contract), DESIGN.md (goal card, the glass progress bar tone).

## 5. Build plan (contract first; ownership per decision 48)
**Contract (orchestrator, committed before agents start):** shared `goals.ts` and the `entities.ts` / `tasks.ts` changes and exports in `index.ts`; the schema and migrations 0008 to 0010 with db tests; server stubs `actions/goals.ts` and `routes/goals.ts` returning 501; the `actions/tasks.ts` changes (`goal` on tasks, `goalId` on create and list; they touch the existing task code, so the orchestrator owns them); the desktop routes, `goals-queries.ts` hook signatures, `prompt-store.ts`, the `ProgressBar` tone, the fake API routes, and empty slot files `goals/list/goals-list-page.tsx`, `goals/detail/goal-detail-page.tsx`, `detail/goal-section.tsx` (mounted after Tags).

**Wave 1 (parallel, 4 agents):**
| Agent | Owns |
|---|---|
| server-dev | `apps/server/src/actions/goals.ts`, `apps/server/src/routes/goals.ts` and their tests (progress rules of D4 incl. archived, deleted and subtask cases, one goal per task, move and undo, 404 for deleted goals, the 500 limit, permission levels, auth on every route). |
| ui-dev A | `modules/tasks/goals/list/**` (page, cards, segmented control, New goal dialog, empty, loading, error, keys) and tests. |
| ui-dev B | `modules/tasks/goals/detail/**` (header, menu, progress card, prompt, notes, tasks card with add popover, rows, keys) and tests. |
| ui-dev C | `modules/tasks/detail/goal-section.tsx` and its test (the Goal row and menu). |

**Then:** merge, `verify`, the four reviewers, fixes, docs-sync, the feature report with the migrations to apply (0008, 0009, 0010).

Checks per unit: server tests on PGlite for every action and route; UI tests against the fake API (list states, the prompt rules including "Not yet", link and unlink with Undo, keyboard), dark and light by token use only.

## 6. Open points (for the owner)
1. **One goal per task (D2).** Simpler and no double counting, but a task like "Run 5 km" cannot count for both "Get fit" and "Marathon". Say if you want many.
2. **Repeating tasks (D4).** The next copy of a repeating task is not linked, so a goal like "Read every day" shows the one task. Repeated actions fit Habits (Step 3) better.
3. **Archived open tasks** are left out of progress (D4). Alternative: count them as not done.
4. **Delete key on the goal page removes from the goal (D12)**, not delete the task. Say if you prefer no Delete key there.
5. **No design reference was viewed** (the browser disconnected). Compare the mockup with a reference you like when you check.

## 7. Suggested changes to earlier docs or decisions
None are applied; existing decisions stay until you agree.
1. docs/DESIGN.md "Segmented control, switch, slider, progress bar": add a glass tone for the progress bar (Tasks yellow on the input background). The existing subtask bar on task cards uses the tile colors (#1C1C1C on rgba(0,0,0,0.15)), which may be hard to see on dark glass; I could not check it on screen.
2. docs/DATABASE.md section 2: add `goal` to the entity types and note that `belongs_to` will be shared by goals and projects, so code must check the target entity's type.

## 8. Sources
Text sources (opened by me):
- [S1] Asana Help, Progress, status, and connecting work to goals (read in the browser): https://help.asana.com/s/article/progress-status-and-connecting-work-to-goals?language=en_US
- [S2] Asana, Goals features: https://asana.com/features/goals-reporting/goals
- [S3] ClickUp Help, Create a Goal (read in the browser): https://help.clickup.com/hc/en-us/articles/6325733579671-Create-a-Goal
- [S4] Linear Docs, Projects: https://linear.app/docs/projects (and Concepts: https://linear.app/docs/conceptual-model)
- [S5] Linear Docs, Initiative and project updates: https://linear.app/docs/initiative-and-project-updates
- [S6] Linear Docs, Project milestones: https://linear.app/docs/project-milestones
- [S7] Cultured Code, Getting Productive with Things: https://culturedcode.com/things/guide/
- [S8] Things 3 on the Mac App Store (linked from culturedcode.com/things/mac/appstore/): https://apps.apple.com/us/app/things-3/id904280696?mt=12
- [S9] Things Mac release notes: https://culturedcode.com/things/support/articles/1100684/
- [S10] Matthew Cassinelli, How to cancel tasks in Things: https://matthewcassinelli.com/how-to-cancel-things-tasks/
- [S11] According to Andrea, Quirks with the Things 3 sidebar: https://accordingtoandrea.com/2019/10/29/quirks-with-the-things-3-sidebar/
- [S12] Laws of UX, Goal-gradient effect: https://lawsofux.com/goal-gradient-effect/
- [S13] NN/g, Progress indicators: https://www.nngroup.com/articles/progress-indicators/
- [S14] NN/g, Confirmation dialogs: https://www.nngroup.com/articles/confirmation-dialog/
- [S15] Asana Forum, How to turn off childish unicorns: https://forum.asana.com/t/how-to-turn-off-childish-unicorns/578094
- [S16] PostgreSQL docs, ALTER TYPE: https://www.postgresql.org/docs/current/sql-altertype.html

Design references (NOT viewed; seen only as search-result text):
- [D1] https://dribbble.com/shots/25371749-Goal-Tracking-App-Manage-Create-and-Track-Your-Progress
- [D2] https://dribbble.com/tags/goal and https://dribbble.com/search/goal-progress
- [D3] https://www.behance.net/gallery/58747837/Visualize-Goal-Setting-App

Not verified: Linear projects not completing themselves (third-party summaries only); Todoist and TickTick having no goal object (comparison summaries); a Things project not completing itself when its pie is full (only the release note about the question on completing with open to-dos was read).
