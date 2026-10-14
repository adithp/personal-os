# Batch 3: Notes (N1 to N4), tasks/notes leftovers, Habits, Money, Projects (report)

Built on branch `step-2-tasks-notes` (not pushed). Nothing is ticked in ROADMAP.md until you say "next". The batch before it (Goals, search, realtime) is in `goals-search-realtime-notes.md`. The working method changed during this batch (decision 68, `.claude/skills/orchestrate-lanes`): parallel lanes, one test pass at the end, no lint fixing while building.

## Checks (final, run once at the end by parallel Haiku agents)
- `pnpm lint`: pass. `pnpm typecheck`: pass. `pnpm docs:check --range abedaec^..HEAD --aggregate --ignore-docs-ok`: pass. `pnpm build`: pass.
- Tests: shared 224, db 89, server 1050 all pass. Desktop 125 files / 1840 tests: all pass except 3 timing-sensitive tests that pass when run alone (`my-tasks/drag-drop`, `my-tasks-page` "reopens a completed task", `projects-list` loading line). Not run in the real Tauri window.
- Bundle: Notes chunk about 615 kB (192 kB gzip); habits 33 kB, money 60 kB, projects 64 kB.

## What was built
1. **Notes N1 to N4** (memo `docs/design/research/notes.md`, decisions 66 and 67): Notes page with folders (3 levels), note list, trash, TipTap Markdown editor with autosave, drafts and conflict bar; wikilinks `[[Title]]` with suggestions, backlinks, outline, slash menu, rename that rewrites links; `#tags` in notes, templates, daily notes (key D), Daily notes list; version history (History tab, preview, line diff, restore with Undo); the window-focus/keyboard rules of Tasks.
2. **Tasks/Notes leftovers:** notes in global search (Notes group in Ctrl K); undoing a tag merge puts `#source` back in notes; Manage tags shows the server reasons (`tag_in_notes`, `tag_not_note_safe`); Daily notes limit message.
3. **Habits** (Ctrl 3): habits and daily logs, schedules (daily, chosen weekdays, every N days), counter habits, streaks and at-risk badge, history calendar, statistics (week/month/year chart), archive/restore.
4. **Money** (no AI): wallets, categories, transactions (income, expense, transfer), repeating transactions, budgets, savings goals, monthly report, subscriptions with upcoming/overdue and "Mark paid".
5. **Projects:** clients, projects, tasks and notes linked to a project (also a Project row in the task detail), milestones, project board, timeline, time tracking (timer and manual entries), client pages.
6. **Process:** orchestrate-lanes skill, scaffold for lanes, CLAUDE.md batch rules, decision 68.

## Migrations to apply (you run `pnpm db:migrate`, in this order)
`0006`, `0007` (favorites), `0008`, `0009` (goals), `0010` (task search vector), `0011` (realtime publication), `0012`, `0013` (notes, folders, triggers), `0014`, `0015` (templates, daily notes), `0016` (note versions), **`0017_habits_money_projects`** (13 tables) and **`0018_habits_money_projects_triggers`** (updated_at triggers, Realtime, grants). After applying, check in Supabase: `drizzle.__drizzle_migrations` has 19 rows; the new tables exist with RLS on; `select tablename from pg_publication_tables where pubname='supabase_realtime'` lists tasks, tags, entity_tags, task_favorites, links, goals, notes, note_folders, note_templates, habits, habit_logs, wallets, categories, transactions, recurring_transactions, budgets, savings_goals, subscriptions, clients, projects, project_milestones, time_entries (and `note_versions` is NOT listed); `anon` has no privileges on them. Then redeploy the server and restart the app.

## Decisions to confirm
Notes: 66 (tags only from text, delete refused while used, templates, daily notes), 67 (10-minute version gap, keep 50, own line diff); a note is not found by tag name; restore of a version keeps the title. Lanes (suggested DECISIONS rows, not yet added): **Habits:** target is a count per scheduled day ("3 times a week, any day" is not supported); streaks count scheduled days only and recompute when the schedule changes; plain tables not entities. **Money:** transactions use an India day string `occurred_on`; a transfer is one row with two wallets; repeats are generated when Money opens (no undo for that run); balances are computed from all live transactions. **Projects:** one project per task or note (a task can also be in one goal); `time.stop` has no undo; one running timer per user; weeks start Monday (India). Merge undo carries note ids and places (limit 200 notes). Searching notes shows them as a third group.

## Known limits / not done
- Not built (need your decision or new libraries): Step 2b (KaTeX, callouts, images and files, CodeMirror raw mode, local graph), trash auto-empty, notes.search/append/summarize as AI actions, Money CSV import and AI categorization, push notifications for habits/subscriptions, AI skills (habit coach, project manager).
- Notes: bold around a `[[link]]` is lost; the open note reloads quietly when changed elsewhere; one write-skew case (a note create racing a save of a note linking to it) can leave a link unstored until the next save; Notes chunk is large (about 192 kB gzip).
- Habits: no start-date field in the dialog; optimistic updates do not change the streak until refetch.
- Money: a monthly subscription on day 29-31 drifts after clamping; the Transactions page shows at most 500 rows per month; wallet delete and transaction create are not serialised.
- Projects: no running-timer chip in the dock; timeline has no drag-to-reschedule; `time.add` accepts entries for a deleted project.
- Authenticated users still have write grants on older tables (a stolen token could write through Supabase's API); see `docs/design/research/realtime.md` section 10.
- Dead scaffolding in Tasks ("Soon" code in `features.ts`, `coming-soon-page.tsx`) was left in place.

## Manual test steps (short; each module's doc and lane notes have more)
After migrations and a restart, check dark and light mode and a 1100x700 window in every step.
1. **Notes:** New note (N), type a title and text, close the window (text is kept); `[[` links and Create row; click a dashed link; rename a note and see "Updated links in N notes"; `#tag` chips and Tags section; templates (side panel Templates), Today (key D); History tab: pick a version, Show changes, Restore, Undo; Trash: restore, delete forever.
2. **Search:** Ctrl K, type 2 letters of a note/task/tag title; Enter opens it; Recent shows on an empty field.
3. **Tags:** merge two tags used in notes then Undo; try deleting a tag used in a note.
4. **Habits:** create daily, weekly and counter habits; check, uncheck, Undo; detail calendar and statistics; archive and restore.
5. **Money:** add wallets, an expense, income and a transfer; a repeat; a budget and a goal; a subscription with a past date then "Mark paid"; Reports.
6. **Projects:** client and project; link tasks and notes; milestones; board drag; timeline; start/stop a timer and add a manual entry; the Project row in a task.
7. **Realtime:** Settings shows "Live updates: On"; edit a row in Supabase and watch the app update.

Feature batch complete. Waiting for your check. Reply 'next' to continue or tell me what to fix.
