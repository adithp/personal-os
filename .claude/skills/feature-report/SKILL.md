---
name: feature-report
description: Write the feature report the owner always wants when a visible, testable feature is finished: what was built, files, checks, models used, merged branches, migrations to apply, docs updated, lessons recorded, manual test steps, known issues, then wait. Use at the end of every feature and after fixes the owner asked for.
---

# feature-report

Send one report per finished feature, only when the owner can see and test something. Internal work (schema, actions, routes, refactors) is not a stopping point: check, commit, continue. Doubts always stop and ask.

## Before writing
Run the verify skill (lint, typecheck, test, docs check, build) and fix everything. Never report a feature with a failing check.

## The report (in this order)
1. **What was built:** a short list in the owner's words (screens and behavior, not file names).
2. **Files created or changed:** the main ones, grouped (database, shared, server, desktop, docs).
3. **Automated checks:** each command and its result (`pnpm lint`, `pnpm typecheck`, `pnpm test` with the file and test counts, `pnpm build`, `pnpm docs:check`). Say what was not checked (for example other display scalings or backgrounds).
4. **Models used:** which model each agent actually ran on, as shown in the task list. If the task list does not show it, say so; never assume.
5. **Branches merged:** each agent branch merged, and any conflicts and how they were resolved (or "none").
6. **Migrations to apply:** the exact new file names to apply with `pnpm db:migrate` (the owner runs it), and what to see in Supabase afterwards (tables, RLS, policy names, columns, triggers, the migration row count). "None" if there are none.
7. **Docs updated:** each doc changed, and any `[docs-ok]` bypass with its reason.
8. **Lessons recorded:** each new lesson (one line) and whether it is guarded or documented, including lessons from agent reports.
9. **Manual test steps:** exact steps to run the app (which commands, which terminals), and what to see at each step. Include dark mode, light mode, all three backgrounds (Transparent, Wallpaper, Solid), keyboard use, and edge cases (server stopped, empty data, errors).
10. **Decisions made that were not specified:** things the owner should confirm or correct.
11. **Not done and known issues.**
12. Finish with exactly: "Feature complete. Waiting for your check. Reply 'next' to continue or tell me what to fix."

## After the owner's check
- A reported problem: fix only that problem, run the checks again, send a new report.
- Only after "next": tick the item in `docs/ROADMAP.md`, commit, and suggest or make the commit message. Do not start the next feature before "next".
