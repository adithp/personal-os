# Research memo: Tasks Feature 6, Inbox

Date: 2026-10-13. Author: research agent (decisions delegated by the owner, to be reviewed later).
Mockup: `docs/design/mockups/tasks-inbox.html` (open it in a browser; the buttons at the top switch dark and light and the page states).

## 1. What is already decided (not redone here)
- The Inbox is a page inside Tasks (`/tasks/inbox`), reached from the side panel row "Inbox" with a count.
- An Inbox task is a top-level task with no due date and no tags, not done, not archived (`inboxTasks()` in `apps/desktop/src/modules/tasks/sections.ts`, CONTEXT.md section 4).
- The page-scoped keys of My tasks stay: N, Space, Enter, Delete, Esc, arrows, ? (docs/features/tasks-redesign.md).

## 2. What the research found
Every point below comes from a page I opened. Points I only saw in search-result summaries are marked **unverified**.

### How leading apps use an inbox
- **Todoist.** A task added without a project goes to the Inbox. You set aside a few minutes each day or week to process it: give tasks a priority, move each to a project, add a date to each task, delete what is not needed. On web/desktop you move a task with "Move to…" or by dragging it onto a project in the sidebar. [S1]
- **Todoist keys** (Manage tasks section): T set date, Shift+T remove date, 1 to 4 set priority, Y change priority, L add label, V move, E complete, Enter open, J/K or arrows move between tasks. [S2]
- **Todoist hover toolbar** (older article): hovering a task shows a small toolbar on the right with add subtask, change due date (calendar icon), comment, and a three-dot menu (priority, reminder, move, add above/below); right-click opens the same menu. [S3]
- **Todoist empty Inbox** (screenshot seen on Mobbin): a centered illustration, a short title ("Capture now, plan later"), two lines that explain what the Inbox is for, and one "Add task" button. In that same screenshot the Inbox row in the sidebar shows **no number** when the Inbox is empty, while Today shows its count; another Todoist screenshot shows the Inbox row with "1". [D2]
- **Things 3.** The Inbox is a holding area: everything you want to do lands there first, and you look over the new to-dos daily and decide when to start each one: Today, Upcoming, Anytime, or turn it into a project. [S4] Moving uses drag and drop, a Move dialog with type-to-search, or Shift+Cmd+M, also for several selected items. [S5]
- **Linear Triage.** A team inbox to "review, update, and prioritize" incoming issues before they join the workflow. Four actions with single keys: Accept (1), Decline (2), Duplicate (3 or MM), Snooze (H). Accept moves the issue into the team's default status, so it leaves Triage. [S6] Linear's notification Inbox: J/K or arrows to move, Backspace deletes one, H snoozes, U marks read/unread. The docs do not say where focus goes after an item is removed. [S7]
- **TickTick.** "Plan Your Day" processes overdue tasks one by one with five choices (Done, Today, Later with suggested dates, Won't Do, delete). "Arrange Tasks" lists all tasks without a due date so you can drag them onto calendar days. [S9] (The official TickTick help page did not load for me, so the claim that Inbox is a built-in smart list is **unverified**.)
- **Apple Reminders (Mac).** Single-step date keys: today Cmd+T, tomorrow Option+Cmd+T, this weekend Cmd+K, next week Option+Cmd+K, all overdue to today Control+Cmd+T. [S10]
- **Asana.** New tasks land in "Recently assigned" in My tasks and are triaged from there (**unverified**: seen only in search summaries of Asana forum and Medium posts, not opened).

### GTD (clarify and organize)
- Process at least once a day, one item at a time, in order; finish a session with the inbox empty; never put an item back into the inbox; keep each decision to a couple of minutes; do it now if it takes under two minutes. [S8]

### Empty states and count badges
- NN/g, empty states: (1) say plainly why the area is empty (system status), (2) teach how content gets there (learning cue), (3) give a direct path to the key task (a button or link). [S11]
- HMRC design patterns, notification badge: numbers above 99 show as "99+"; below 1 the badge is not shown; the badge carries an aria-label like "Number of x". [S12]

### Design references (I could view screenshots in the browser)
- **Dribbble "Tasks Inbox" by Jordi Plaza** [D1]: a three-pane layout (navigation, list, detail), the active nav row marked with a small red dot instead of a number. Busy, onboarding-style; not a fit.
- **Todoist web Inbox (Mobbin)** [D2]: flat single-line rows; muted gray counts in the sidebar; empty state as described above. The quiet counts fit our style; the illustration does not (DESIGN.md has no illustrations).
- **Linear issue lists (Mobbin)** [D3]: dense one-line rows, title on the left, small metadata on the right, grouped by status. Shows how a row can stay one line with details on the right.
- **Plain "All threads" empty state (Mobbin)** [D4]: a small bordered box in the list area with a title "Inbox zero" and one muted line. The most minimal empty state I found.
- **Featurebase Inbox empty state (Mobbin)** [D4]: a small icon and one line ("New messages will appear here").
- Could not view: Things 3 screens (the Mobbin search for Things failed to load), Behance (not reached before the browser became unstable).

**Chosen pattern:** Todoist and Linear's flat list of single-line rows, with the quick actions appearing on hover or focus in the space where the date and tag would sit (an Inbox task has neither, so that space is free), and a Plain-style quiet empty state upgraded with NN/g's three parts. It is redrawn in our tokens: one glass card holding the rows, `--input-bg` for hover, lavender focus ring, Tabler outline icons, no illustration.

## 3. Decisions
Confidence: high = backed by several sources and our docs; medium = backed by one source or by our own consistency; low = my judgement, the owner may well choose differently.

**D1. Layout: a single list of rows (List-view rows), no Cards, Board, Filter, Sort or Group.**
- Choice: header ("Inbox" + summary + "?" button), the quick add bar, then one glass card holding the Inbox tasks as `TaskRow`-style rows. No view switch, no Filter / Sort / Group menus, no sections. The detail panel opens on the right as in My tasks.
- Reason: an inbox is a short-lived queue that you work through top to bottom [S4, S8]; the apps that process an inbox show flat one-line rows [D2, D3]. Rows also leave room on the right for the quick actions. Reuse `TaskRow` (add an optional quick-actions slot) instead of a new component.
- Rejected: reusing the whole My tasks page with a filter (brings menus that do nothing here); Cards (actions do not fit on a card without clutter); a one-at-a-time "process" card like TickTick Plan Your Day [S9] (a second mode to learn; the keyboard flow in D4 already gives one-at-a-time processing).
- Confidence: high.

**D2. Order: the manual order (position), as in the No date section; no drag and drop in the Inbox.**
- Choice: same order as My tasks' No date section, so new tasks appear at the end. No drag handles on this page.
- Reason: GTD says process in order [S8]; reusing the existing order keeps one rule. Dragging only reorders here (there are no projects yet to drop onto, unlike Todoist [S1]), which is not useful for a queue.
- Rejected: newest first (breaks "in order"); oldest first by created date (differs from My tasks for no gain).
- Confidence: medium.

**D3. Quick actions on each row, shown on hover or keyboard focus (always shown on the selected row).**
- Choice, left to right, 28 px icon buttons with tooltips: **Today** (calendar-event icon), **Date…** (calendar icon, opens a small menu: Today, Tomorrow, Next week (Monday), then a date field "Pick a date"), **Tag…** (tag icon, opens the tag picker with search and "Create #name"), **More** (dots icon: Priority Urgent/High/Medium/Low, Archive, Delete). The existing trash button of `TaskRow` moves into More on this page.
- Reason: Todoist's hover toolbar puts the date button and a "more" menu on the right of the row [S3]; Todoist's own Inbox advice is exactly: date, priority, move, delete [S1]; Apple and Todoist both make "today" and "tomorrow" one step [S2, S10]. Three visible icons plus More keeps the row quiet (CONTEXT section 1: details on hover).
- Rejected: Linear's Accept/Decline/Duplicate (team review, not personal sorting) [S6]; Snooze (no field for it; "Tomorrow" covers it); "This weekend" (Apple's rule for it is tricky [S10], and weekends are less clear for a student and freelancer); always-visible actions on every row (noisy).
- Confidence: medium.

**D4. How each action maps to existing actions (no new server action).**
| Quick action | Action called | Leaves the Inbox? | Toast |
|---|---|---|---|
| Today, Tomorrow, Next week, Pick a date | `tasks.move` `{ id, dueAt: start of that India day, dueAllDay: true }` (no neighbours) | Yes | "Task moved." with Undo (exists) |
| Tag (existing tag) | `tasks.update` `{ id, tagIds: [tagId] }` | Yes | "Tag added." with Undo (new, desktop only) |
| Tag (new name) | `tags.create`, then `tasks.update` as above (the detail panel's tag picker already does this) | Yes | "Tag added." with Undo |
| Priority | `tasks.update` `{ id, priority }` | No | none (same as today) |
| Complete (checkbox, Space) | `tasks.complete` | Yes | "Task completed." (exists) |
| Archive | `tasks.archive` | Yes | "Task archived." (exists) |
| Delete (More, Delete key) | `tasks.delete` | Yes | "Task deleted." (exists) |
- Reason: rule 1 (one action registry). The server's `tasks.update` already returns an undo descriptor that restores the previous tags (checked in `apps/server/src/actions/tasks.ts`), so the Undo toast for tags needs only a desktop change in `useTaskActions` (today `update` shows no toast). `tasks.move` with a date and no neighbours is the same path the Upcoming drop uses (decision 55), and a picked day makes the task all-day like that picker.
- Why an Undo matters here: the task vanishes from the list the moment it gets a date or tag, so a mis-click must be easy to reverse.
- Rejected: a new `tasks.triage` server action (not needed: every change already exists and returns undo); using `tasks.update` for dates (it has no toast; `move` already has one).
- Confidence: high.

**D5. Keyboard: keep every existing key and add four Inbox-only keys (T, L, 1 to 4 use Todoist's keys).**
- Choice: N, Space, Enter, Delete, Esc, Up/Down, ? work exactly as in My tasks (List view: arrows move one row). Added on the Inbox page only, with the same guards (not while typing, not in menus, dialogs, the detail panel or the palette, never with Ctrl): **T** opens the Date menu of the focused row, **L** opens its Tag picker, **1 to 4** set priority Urgent to Low. The "?" help lists them under "Inbox".
- After a task leaves the list (date, tag, done, archive, delete), focus moves to the row that took its place (the next one; the previous one if it was last), using the existing `keepPlace` logic. So you can process the whole inbox with T, Enter, T, Enter… without the mouse.
- Reason: Todoist uses T for date, L for label and 1 to 4 for priority [S2]; one-key processing matches Linear's single-key triage [S6]. Linear's docs do not say where focus goes after removal [S7], so "the next row" is our choice from GTD's "in order" [S8].
- Rejected: Ctrl shortcuts (DESIGN.md section 9 keeps plain keys on the Tasks page); J/K (we already use arrows); Linear's 1/2/3 meanings.
- Confidence: medium (adding keys is an extension; the owner may prefer no new keys).

**D6. How items leave the Inbox.**
- Choice: a task leaves the moment it has a due date or at least one tag, or is done, archived, deleted, or becomes a subtask. The list is computed with `inboxTasks()` from the same open-tasks cache as the count, so an optimistic change removes the row at once; a failed change puts it back with the error toast (existing rollback). Setting only a priority keeps the task in the Inbox (the definition does not include priority).
- If the detail panel is open on a task and you give it a date there, the row disappears but the panel stays open on that task until you close it.
- Reason: matches the decided definition; GTD says nothing goes back into the inbox once clarified [S8].
- Confidence: high.

**D7. The side panel count.**
- Choice: shows the number of Inbox tasks (same `inboxTasks()` list) in muted small text at the right of the row, as it is built now. Hidden when the count is 0, while tasks are loading, and on a load error. Above 99 it shows "99+". Its accessible name is "Inbox, N tasks to sort". When the panel is collapsed there is no number on the icon; the tooltip reads "Inbox (N)". It updates live from the cache (optimistic changes and refetches), no polling.
- Reason: Todoist hides the Inbox number at zero and shows muted numbers [D2]; HMRC: no badge below 1, "99+" above 99, an aria-label [S12]. Muted text instead of a colored pill keeps the panel quiet and matches the existing code.
- Rejected: a red dot or colored pill [D1] (alarm-like; our danger color is for overdue only); a number on the collapsed icon (cramped at 56 px).
- Confidence: high.

**D8. Empty state ("inbox zero").**
- Choice: inside the list area, a quiet glass card centered in the column: a 40 px round `--input-bg` circle with a Tabler `inbox` icon in text-muted, title "Your inbox is empty" (16, medium), one muted line "Every task has a date or a tag. New tasks without either show up here.", and one secondary button "Open My tasks". The quick add bar above stays, so adding a task is one click away. Same text whether the inbox was never used or was just cleared.
- Reason: NN/g's three parts: status, learning cue, direct path [S11]; Plain's small boxed empty state is the minimal form [D4]; Todoist's explanation line and single button [D2]. Plain English instead of the jargon "Inbox zero" (CONTEXT section 1.1).
- Rejected: an illustration (Todoist [D2]; DESIGN.md has none); a joke line like "Time for a walk" [D4] (cute once, odd the hundredth time); a celebration animation.
- Confidence: medium (wording is taste).

**D9. Loading and error states.**
- Choice: exactly as My tasks: a muted "Loading tasks…" status line while loading (the count is hidden), and on error a glass card with role alert, the server's message (or "Could not load your tasks.") and a "Try again" button.
- Reason: one pattern across Tasks pages; NN/g wants status to be clear so empty is not confused with loading [S11].
- Confidence: high.

**D10. The quick add bar on the Inbox page.**
- Choice: the same `QuickAddBar` (focused when the page opens, N focuses it). It keeps understanding dates, tags, priority and repeats. A task typed without a date or tag lands in the Inbox (at the end of the list). A task typed with a date or tag does not belong in the Inbox, so the page shows an info toast "Added to My tasks." so it does not seem lost.
- Reason: Todoist's Inbox is where tasks without a project land, and Quick Add can set date and labels at once [S1, S2]; Things lets Quick Entry skip the Inbox [S4, S5]. Turning off parsing on this page would make one bar behave two ways.
- Rejected: forcing every task typed here into the Inbox (would need to ignore typed dates); no feedback (a task that vanishes looks like a bug).
- Confidence: medium. Needs a small optional callback on `QuickAddBar` (desktop only).

**D11. Page header text.**
- Choice: title "Inbox" (22 semibold), summary under it in small muted text: "4 to sort" (1 → "1 to sort"); nothing when empty (the empty card says it). One muted hint line in the header area: "Give each task a date or a tag to file it." shown only when there are tasks.
- Reason: tells new users how items leave, which is the one non-obvious rule (NN/g learning cue [S11]).
- Confidence: low (could be dropped for a cleaner header).

**D12. Turning it on.**
- Choice: `TASK_FEATURES.inbox = true`, the route `/_app/tasks/inbox` renders the Inbox page instead of `ComingSoonPage`. Tests: the list matches `inboxTasks()`, each quick action sends the action in D4, the row leaves and focus moves on, the count rules (0 hidden, 99+), the empty, loading and error states, the new keys and their guards, the quick add toast.
- Confidence: high.

## 4. Open points (for the owner)
1. **Tasks that should stay undated.** With the current definition, a task you deliberately keep without a date (Things calls this "Anytime" [S4]) can only leave the Inbox by getting a tag. That is fine if you tag everything; otherwise those tasks stay forever. Option for later: a third way out (for example a "Sorted" flag). Not built now.
2. **Toast wording for dates.** D4 reuses "Task moved." Saying where it went ("Moved to Tomorrow.") is clearer but adds new wording. I kept the existing text.
3. **Selecting several tasks at once** (Things and Todoist allow it [S5, S2]). Left out to keep Feature 6 small.
4. **New keys (D5).** If you prefer no new keys, drop T, L and 1 to 4; everything still works with the mouse and Enter (detail panel).

## 5. Suggested changes to earlier docs or decisions
None of these are applied; existing decisions stay until you agree.
1. docs/features/tasks.md, "Rules": add "Adding a tag from the Inbox shows an Undo toast ('Tag added.')". Today only complete, delete, archive, move and blocker changes show one. Evidence: the task disappears from view on tag, so undo is needed (D4); the server already returns the undo.
2. docs/DESIGN.md section 9 lists the Tasks plain keys (N, Space, Enter, Delete, Esc, arrows, ?). If D5 is accepted, add "Inbox also: T date, L tag, 1 to 4 priority". Evidence: [S2].
3. docs/features/tasks-redesign.md "Panel details": add the count rules from D7 (hidden at 0 and while loading, 99+, tooltip when collapsed). Evidence: [S12], [D2].

## 6. Sources (all opened by me)
Text sources:
- [S1] Todoist, Use the Inbox in Todoist: https://www.todoist.com/help/articles/use-the-inbox-in-todoist-HwHvYErS
- [S2] Todoist, Use keyboard shortcuts in Todoist: https://www.todoist.com/help/articles/use-keyboard-shortcuts-in-todoist-Wyovn2
- [S3] Computerworld, How to use Todoist for team task management: https://www.computerworld.com/article/1617400/how-to-use-todoist-for-team-task-management.html
- [S4] Cultured Code, Getting Productive with Things: https://culturedcode.com/things/guide/
- [S5] Cultured Code, Moving Items in Things: https://culturedcode.com/things/support/articles/9651894/
- [S6] Linear Docs, Triage: https://linear.app/docs/triage
- [S7] Linear Docs, Inbox: https://linear.app/docs/inbox
- [S8] FacileThings, GTD: 11 Guidelines for Clarifying/Processing: https://facilethings.com/blog/en/guidelines-to-clarify-process
- [S9] MakeUseOf, TickTick tricks (Plan Your Day, Arrange Tasks): https://www.makeuseof.com/ticktick-tricks-to-supercharge-productivity/
- [S10] Apple Support, Keyboard shortcuts in Reminders on Mac: https://support.apple.com/guide/reminders/keyboard-shortcuts-remn19b3424c/mac
- [S11] NN/g, Designing Empty States in Complex Applications: 3 Guidelines: https://www.nngroup.com/articles/empty-state-interface-design/
- [S12] HMRC design patterns, Notification badge (issue 142): https://github.com/hmrc/design-patterns/issues/142

Design references (screenshots viewed in the browser):
- [D1] Dribbble search "task inbox": https://dribbble.com/search/task-inbox and the shot "Tasks Inbox" by Jordi Plaza: https://dribbble.com/shots/22775432-Tasks-Inbox
- [D2] Mobbin, Todoist web Inbox screens: https://mobbin.com/search/apps/web?content_type=screens&q=todoist+inbox
- [D3] Mobbin, Linear web screens: https://mobbin.com/search/apps/web?content_type=screens&q=linear+triage
- [D4] Mobbin, inbox empty states (Plain, Featurebase): https://mobbin.com/search/apps/web?content_type=screens&q=inbox+empty+state

Not verified (seen only in search summaries): Asana's "Recently assigned" triage; TickTick's official help page on the Inbox smart list (did not load); Things' badge count options.
