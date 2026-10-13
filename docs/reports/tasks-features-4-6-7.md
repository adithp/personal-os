# Tasks Features 4, 6 and 7 (reports)

Features 4 (Quick add), 6 (Inbox) and 7 (Reporting) were built while the owner was away (decision 58). Feature 5 has its own report (`tasks-feature-5.md`). Waiting for the owner's check. Nothing is ticked in ROADMAP.md. Design and product decisions for 5, 6 and 7 come from research memos in `docs/design/research/` (made by a research agent with sources: review them).

## Checks (all four features together)
Lint, typecheck, build, `pnpm docs:check` and all tests pass (115 test files, 2052 tests). Reviews: code, design, security and docs reviewers ran on every feature; their findings were fixed (see LESSONS.md and DECISIONS.md rows 57 to 61). Not run in the real Tauri window.

## Migrations
Only Feature 5 needs them (0006 and 0007, see `tasks-feature-5.md`). Features 4, 6 and 7 need none.

## Feature 4: Quick add
The quick add bar understands what you type (India time): `#tag`, `!1` to `!4` or `!urgent/high/medium/low`, repeats (`every day`, `every monday and thursday`, `every month on the 15th`, `every weekday`, `every year`), and dates and times (`tomorrow 5pm`, `next friday`, `oct 12`, `in 3 days`, `5pm`). Chips under the bar show what was understood; the x puts those words back in the title. New tags are created automatically. Details and the exact rules: `docs/features/tasks.md`, decision 57.
Test: type `Call mom tomorrow 5pm #family !high every week`, check the chips, press Enter; try the x on a chip; try `Call April about rent` (no date) and only `tomorrow` (send disabled, "Add a title").

## Feature 6: Inbox
Side panel → Inbox: tasks with no date and no tags in one flat list. Hover or focus a row for quick actions: Today, Date…, Tag…, More (priority, archive, delete). Keys on this page: T date, L tag, 1 to 4 priority. A task leaves when it gets a date or a tag; Undo toasts. Count in the side panel (hidden at 0, 99+). Empty card "Your inbox is empty". Memo: `docs/design/research/tasks-inbox.md`; decision 60.
Test: add three tasks, press T on one and pick Tomorrow, press L on another and create a tag, press 2 on the third (stays; priority only); use Undo; resize to 1100×700; dark and light.
Open points for you: a task you want to keep undated can only leave the Inbox by getting a tag; are the new keys T, L, 1 to 4 OK?

## Feature 7: Reporting
Side panel → Reporting: switch "This week | This month" (India time, week starts Monday). Cards Done, On time, Overdue now, Added with a quiet comparison to the previous period; chart "Done per day" and a bar list "Done by tag"; "Show table" on each; states for loading, nothing ever done, empty period and errors. The server counts from rows read through the user scope (no raw SQL). Memo: `docs/design/research/tasks-reporting.md`; decision 61.
Test: complete a few tasks (some late, some with tags), open Reporting, switch to month, press Show table, check the numbers by hand; try with no completed task (card "No finished tasks yet").
Known limits: the yellow bars are faint in light mode (values are in labels, tooltip, table); the Reporting chunk is 105 kB gzip (loads only on that page); a failed switch of period shows the error card, not the old picture; Added counts the automatic next copy of a repeating task; the overdue number reads at most 20,000 tasks.

## Other open points
- The design-consistency job (`design:check`, shared-components rule) was never sent: still open.
- Goals (Feature 8) is the last "Soon" item in Tasks and was not asked for; Portfolios belongs to Step 5.
- `ENTITY_TYPES` still has `tag`. The dashboard assistant summary, Upcoming card and Activity card still show placeholder text.
- The old `.claude/worktrees/` folders may remain on disk (Windows locks); they are git-ignored, delete them by hand.
