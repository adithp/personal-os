# Backend API

Base URL: https://<duckdns-domain>/api/v1
Auth: every request sends Authorization: Bearer <Supabase JWT>. The backend verifies it with the Supabase JWKS (asymmetric signing keys) using the jose library: keys from <SUPABASE_URL>/auth/v1/.well-known/jwks.json, issuer <SUPABASE_URL>/auth/v1, audience authenticated. Fastify registers every route under /api/v1 itself; Caddy does not rewrite paths.
The server listens on 127.0.0.1 by default (HOST); the Docker image sets HOST=0.0.0.0 so Caddy can reach it.
Format: JSON. Validation: Zod schemas from packages/shared.
Errors: { "error": { "code": string, "message": string } }
While the database is missing migrations, a request that fails because of it answers 503 with code `schema_behind` and the message "Database update needed: run pnpm db:migrate" (the server also logs the missing migration files at startup). The server only checks; it never applies migrations.
CORS: the allowed origins come from CORS_ORIGINS (comma-separated); the default is the Tauri desktop app (http://tauri.localhost, https://tauri.localhost, tauri://localhost) and the Vite dev server (http://localhost:1420, http://127.0.0.1:1420). Methods GET, POST, PATCH, PUT, DELETE, OPTIONS; headers Authorization and Content-Type.

### Error codes
| Status | Code | When |
|---|---|---|
| 400 | validation_error | Zod input problems (messages joined with "; ") and rule violations such as "Subtasks go one level deep only" |
| 400 | bad_request | Malformed JSON, payload too large, other framework 4xx |
| 400 | cannot_undo | POST /undo with an action that is not a write or destructive action |
| 401 | unauthorized | Missing, malformed, expired, or wrongly signed token (with a www-authenticate header) |
| 404 | not_found | Unknown route, or a task, tag, favorite, or goal that does not exist (also another user's: never a 403) |
| 404 | unknown_action | POST /undo with an action name that does not exist |
| 409 | conflict | A tag rename onto an existing name, or restoring a tag whose name exists again |
| 409 | favorites_limit | More than 12 favorites |
| 409 | tag_not_note_safe | Renaming or merging a tag that notes carry to a name a note cannot hold (only letters, numbers, _, - and / are allowed in a note tag) |
| 409 | tag_in_notes | Deleting a tag that a live note still has in its text; the message gives the count |
| 409 | template_name_taken | A template name that another live template has (ignoring case) |
| 409 | goal_full | A goal already has 500 tasks |
| 409 | confirmation_required | An external or destructive action without confirmation (the app's buttons confirm, so it never hits this) |
| 409 | blocked | Completing a blocked task (complete, update to done, move into Done); the message lists the blockers |
| 409 | circular_dependency | Adding a blocker that would make tasks wait for each other |
| 500 | internal_error | Anything else; the body never leaks details |
| 503 | schema_behind | The database is missing migrations (see above) |

## Standard resource routes
Each resource has: GET list (filters, sort, page), GET by id, POST create, PATCH update, DELETE (soft delete).
Every write route calls the matching action in the action registry.
Built so far: /tasks (all five, plus complete, archive, unarchive, move, and blockers add and remove) /tags (list, create, update, delete, merge; no get by id) and /task-favorites (list, create, update, move, delete), and /goals (list, get, create, update, status, delete) with PUT /tasks/:id/goal. Restoring a favorite, a tag or a goal, and unmerging, have no routes of their own: they run through POST /undo. The other resources arrive with their module step.

Resources: /tasks, /habits, /habit-logs, /notes, /note-folders, /note-templates, /tags, /projects, /milestones, /clients, /time-entries, /wallets, /categories, /transactions, /budgets, /savings-goals, /subscriptions, /people, /dashboards, /ai/skills

Responses:
- List: `{ "items": [...] }` (tasks: filters `status`, `priority`, `tagId` (each repeatable), `dueFrom`, `dueTo`, `noDate`, `completedAfter`, `completedBefore`, `parent` (`none` = top-level, the default, or a task id for its subtasks), `archived`, `sort`, `order`, `limit`, `offset`).
- Task list details: `sort` is position (default), dueAt, priority, createdAt, or title (dueAt always puts tasks without a date last); `order` is asc (default) or desc; `limit` defaults to 500 (max 1000) and `offset` to 0; `dueFrom` is inclusive and `dueTo` exclusive (so are `completedAfter` and `completedBefore`); `noDate=true` returns only tasks with no due date; `archived=true` returns only archived tasks (default false); `status`, `priority`, and `tagId` accept one value or a repeated key.
- A task carries `tags`, `subtaskCount`, `subtasksDone`, `blockedBy` (the unfinished tasks that block it), `goal` (`{ id, title }` of its live goal, or null; subtasks always null), and `dueAllDay`.
- Get: `{ "item": {...} }`.
- Create, update, complete, delete: `{ "item": {...}, "undo": { "action", "input" } | null }`. Create answers 201. Delete is a soft delete.
- `undo` is the way to reverse the change: send it as the body of `POST /undo`.
- Task times are ISO 8601 strings in UTC (for example `2025-10-07T11:30:00.000Z`) and must carry a zone.
- Task create and update accept `title` (1 to 500 characters), `description` (up to 20000), `status`, `priority` (1 to 4), `dueAt`, `dueAllDay`, `reminderAt`, and `tagIds` (up to 20; on update it replaces the task's tags); create also accepts `tagNames` (tag names without # or spaces or invisible characters, each found ignoring capitals or created with the next palette color; together with `tagIds` at most 20, else 400); create and update accept `recurrenceRule` (it must be exactly one of the presets: `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=` with 1 to 7 two-letter days in Monday-to-Sunday order without repeats, `FREQ=MONTHLY;BYMONTHDAY=1..31`, `FREQ=YEARLY`, or null on update to stop repeating; anything else is 400 `validation_error`; a repeating task needs a due date, also when the due date is cleared later, else 400 `validation_error` "A repeating task needs a due date"; `dueAt` must be between the years 2000 and 2100). Completing a repeating task (complete, update to done, or move into Done) creates the next copy and returns an undo with action `tasks.reopen`; update also accepts `position` (a number from -1e9 to 1e9, smaller is higher in the manual order; POST /tasks/:id/move works it out and the undo of a move uses it); create also accepts `parentTaskId` (the parent must itself be top-level). `dueAllDay: true` needs a `dueAt`; the server stores the start of that day in India time. Clearing `dueAt` on an all-day task clears the flag. Create also accepts `goalId` (the goal must exist, else 404; a goal with 500 tasks gives 409 `goal_full`; linked in the same step). The list filter `goalId` returns the live top-level tasks of that goal of every status, archived too (the `archived` filter is ignored; an unknown or deleted goal gives an empty list).
- Tag input: `name` (1 to 40 characters, no spaces, no `#`) and an optional `color` (`#RRGGBB`; missing means the next color of the module palette).

## Special routes
| Method | Path | Purpose |
|---|---|---|
| GET | /health | Server health (full path /api/v1/health, no auth). Returns {"status":"ok","time":<UTC>} |
| GET | /tags | List tags: `{ items: [...] }`, each with `taskCount` and `favoriteCount` (live tasks of any status that have it, and favorites that use it); N3 adds an optional `noteCount` (live notes whose text has it; missing means 0) |
| POST | /tags | Create a tag: 201 when created; 200 with the existing tag when the name exists (ignoring case). `undo` is null |
| PATCH | /tags/:id | Rename or recolor a tag |
| DELETE | /tags/:id | Delete a tag: removed from every task (the tasks stay) and from favorites; returns the tag and an undo |
| POST | /tags/:id/merge | Body `{ targetId }`: move this tag's tasks and favorites to the target tag and delete this one; returns the target tag and an undo |
| GET | /goals | Goals with progress: `{ items }`, optional `?status=active|achieved|dropped` |
| GET | /goals/:id | One goal with progress |
| POST | /goals | Create (title, description, targetAt); 201 |
| PATCH | /goals/:id | Change title, notes, target date |
| POST | /goals/:id/status | Body `{ status }`: achieved, dropped, or active again |
| DELETE | /goals/:id | Delete (the tasks stay); the undo is goals.restore |
| PUT | /tasks/:id/goal | Body `{ goalId }` (or null): put the task in a goal, move it, or take it out |

Goal details: `title` 1 to 200 characters, `description` up to 20,000 (or null), `targetAt` an ISO time or null stored as the start of that India day; PATCH needs at least one field (else 400 "Nothing to change"); POST /goals/:id/status also accepts `closedAt`, which only the undo sends (not in the future, not before the goal was created), and becoming active clears it; all write routes return `{ item, undo }` (undo null when nothing changed), POST /goals answers 201; GET /goals lists active goals first (target date soonest first, no date last, then created), then achieved and dropped (newest closed first); PUT /tasks/:id/goal with `goalId` null on a task in no goal answers 404 "The task is not in a goal", a subtask 400 "Link the parent task instead.", a deleted or non-goal target 404, the same goal again is a no-op with undo null, and it returns the goal the task is now in (or the goal it left).
| GET | /task-favorites | The favorites in their order: `{ items: [...] }` (Feature 5) |
| POST | /task-favorites | Save a view: body `name`, `view`, optional `color`, `icon`. 201; the same view again returns the existing favorite with a null undo; 409 `favorites_limit` at 12; 400 for an unknown tag id |
| PATCH | /task-favorites/:id | Rename or change color or icon |
| POST | /task-favorites/:id/move | Body `afterId` and/or `beforeId` |
| DELETE | /task-favorites/:id | Remove (soft); the undo is favorites.restore |
| POST | /tasks/:id/archive | Archive a task (returns the task and an undo) |
| POST | /tasks/:id/unarchive | Bring an archived task back |
| POST | /tasks/:id/complete | Mark a task done (returns the task and an undo) |
| POST | /tasks/:id/blockers | Body `{ blockerId }`: make that task block this one. 400 for itself, 409 `circular_dependency` for a cycle, 404 unknown. Adding the same link again changes nothing. Returns the task and an undo (null when nothing changed) |
| DELETE | /tasks/:id/blockers/:blockerId | Stop that task from blocking this one (returns the task and an undo; null when there was no such link) |
| GET | /tasks/report | Numbers for the Tasks report: query `period=week` or `month`; returns `{ item }` with the India days of the period (done, onTime, late, noDueDate per day), totals, the previous period up to the same point, `overdueNow`, done by tag (top 5, other tags, no tag). 400 `validation_error` for a missing or unknown period. The answer also has `period`, `timeZone` (Asia/Kolkata), `today`, `start`, `end` (dates `YYYY-MM-DD`; a week runs Monday to Sunday; `days` has one entry per day, future days at zero), `added` in totals and previous, and `hasEverDone` |
| POST | /tasks/:id/move | Drag and drop: body `status`, `dueAt`, `dueAllDay`, `afterId` (task just above), `beforeId` (task just below), at least one; returns the task and an undo. The position goes between the two neighbours; 400 when a neighbour is the task itself, has a different parent, or `afterId` is not above `beforeId`; 404 for an unknown, deleted or other user's task or neighbour. The status and dates change exactly like in PATCH /tasks/:id |
| POST | /undo | Run the `undo` returned by a write: body `{ "action": "tasks.restore", "input": { "id": "..." } }`. Only write and destructive actions can be run this way; anything else answers 400 cannot_undo |
| GET | /me | The signed-in user from the token: {id, email, role}. Used to check that login works end to end |
| GET | /links?entityId= | Links for an entity (backlinks, project items) |
| POST | /links | Create a link |
| GET | /graph?focus=&depth=&types= | Nodes and edges for the knowledge graph |
| POST | /search | Global search (q 1 to 100 characters, control characters become spaces; types: task, tag; limit 1 to 20, default 5, per group; text with no letters or digits answers groups []; an aborted request on the client is an AbortError, not an ApiError). Body { q, types?, limit? } (a POST so the search text stays out of access logs); answer { item: { q, groups } }. Tasks and tags now; mode semantic, Gmail and Drive later |
| GET | /notes?folderId=&tagId=&dailyOnly=&trash=&sort=updated or title or created&limit=&offset= | Notes without their text (id, title, folderId, pinned, 140-character excerpt, dates; N3 adds optional `tagNames` and `dailyDate`); folderId none means no folder; `tagId` and `dailyOnly` are N3 filters; pinned first |
| GET | /notes/titles | `{ items: [{ id, title }] }` of every live note (link suggestions) |
| GET | /notes/:id/links | `{ item: { backlinks: [{ noteId, title, context }], outgoing: [{ target, noteId \| null }] } }` |
| GET | /notes/:id | One note with `contentMd` and `revision` (a trashed note too) |
| POST | /notes | Create (title optional: Untitled, Untitled 2, ...); 201. N3 adds `templateId` (ignored when `contentMd` is sent; `{{title}}`, `{{date}}`, `{{time}}` filled in India time) |
| PATCH | /notes/:id | Body `baseRevision` plus contentMd, folderId or pinned; `force: true` is Keep mine; the revision is only checked when `contentMd` is sent (pin and folder moves never conflict); 409 `note_conflict` when the revision is old (the 409 has no note in its body: fetch GET /notes/:id) |
| POST | /notes/:id/rename | Answers `{ item, undo }` where `item` is the note plus `updatedNoteIds` (other notes whose [[links]] were rewritten). Body `title` (unique among live notes ignoring case, no [ ] \| #; 409 `note_title_taken`) |
| DELETE | /notes/:id | Move to the trash |
| POST | /notes/:id/restore | Back from the trash (a taken title gets " (2)") |
| DELETE | /notes/:id/forever | Delete a trashed note for good (a live note: 400); answers `{ item: { id } }` |
| DELETE | /notes/trash | Delete every trashed note; answers `{ item: { deleted } }` |
| GET, POST | /note-folders | List with `noteCount` / create (`name`, `parentId`); 400 `folder_too_deep` (3 levels), 409 `folder_name_taken` |
| PATCH, DELETE | /note-folders/:id | Rename or move (400 into itself or its own subfolders) / delete an empty folder (409 `folder_not_empty`) |
| POST | /note-folders/:id/restore | Bring a deleted folder back (top level if its parent is gone) |
| POST | /notes/daily | Stage N3. The title is `YYYY-MM-DD`, or `YYYY-MM-DD (daily)` when a normal note has that title, then `YYYY-MM-DD (daily 2)` and so on. Body `{ date? }` (YYYY-MM-DD, an India day, default today): returns `{ item, undo }` with that day's note, created if missing (title `YYYY-MM-DD`, or `YYYY-MM-DD (daily)` when a normal note has that title; text from the daily-default template; undo `notes.delete` only when created). Declared before `/notes/:id` |
| GET, POST | /note-templates | Stage N3. List (`id`, `name`, `contentMd`, `isDailyDefault`, dates; by name) / create (`name` 1 to 80, unique among live templates ignoring case, 409 `template_name_taken`; `contentMd` up to 200000; `isDailyDefault` clears the flag on the others); 201 |
| PATCH, DELETE | /note-templates/:id | Change name, text or `isDailyDefault` / delete (undo restores) |
| POST | /note-templates/:id/restore | Bring a deleted template back |
| GET | /notes/:id/versions | Stage N4. `{ items: [{ id, createdAt, reason, words, wordsDelta }] }`, newest first, no text. `reason` is `auto`, `before_restore` or `conflict`; `wordsDelta` is the words of that version minus the next older one (the oldest: against empty). Works for a trashed note; 404 `not_found` when the note is missing. |
| GET | /notes/:id/versions/:versionId | Stage N4. `{ item: { id, createdAt, reason, words, wordsDelta, title, contentMd } }`; 404 `not_found` |
| POST | /notes/:id/restore/:versionId | Stage N4. Stores the current text as a `before_restore` version (unless the newest version already has that text; then no row is added), then puts the version's text back (the title is not changed). Answers `{ item, undo }`: the updated note (revision +1) and `notes.restoreVersion` of the version that holds the old text (the new `before_restore` version, or the existing newest one). 404 `not_found` for a trashed or missing note or a missing version. The three version routes are declared before the `/notes/:id` routes |
| GET | /calendar/events?from=&to= | Events in a range |
| POST | /calendar/events | Create event (writes to Google) |
| GET | /mail/messages?q=&label= | List or search emails |
| GET | /mail/messages/:id | Read an email |
| POST | /mail/send | Send, reply, or forward |
| POST | /mail/drafts | Save draft |
| PATCH | /mail/messages/:id | Archive, star, label, delete |
| GET | /drive/files?folder=&q= | Browse or search Drive |
| POST | /drive/upload | Upload a file |
| GET | /drive/files/:id/download | Download a file |
| GET, POST | /wallets | Money. List (`?includeArchived=true`; each wallet carries `balancePaise`) / create (201). See docs/features/money.md for all Money routes |
| PATCH, DELETE | /wallets/:id | Change (name, kind, color, openingBalancePaise, archived) / delete (409 `wallet_in_use` while it has transactions) |
| POST | /wallets/:id/restore | Bring a deleted wallet back |
| GET, POST | /categories | List (creates the default categories on the very first call) / create (409 `name_taken`) |
| PATCH, DELETE, POST | /categories/:id, /categories/:id/restore | Change / delete (transactions keep it, shown as uncategorised) / restore |
| GET, POST | /transactions | List newest first (`walletId` also matches transfers into it, `categoryId`, `kind`, `from`, `to`, `q`, `limit` up to 500, `offset`) / create income, expense or transfer (`amountPaise`, `occurredOn` India day, default today) |
| PATCH, DELETE, POST | /transactions/:id, /transactions/:id/restore | Change / delete / restore |
| GET, POST | /recurring-transactions | List / create (`rule` is a repeat preset, `startOn`, `endsOn`) |
| POST | /recurring-transactions/run | Creates the transactions of rules due up to today; `{ created }`. No undo |
| PATCH, DELETE, POST | /recurring-transactions/:id, /recurring-transactions/:id/restore | Change (also `active`) / delete / restore |
| GET, PUT | /budgets | `?month=YYYY-MM` list with `spentPaise` and `percent` / set `{ categoryId, month, amountPaise }` (replaces) |
| DELETE | /budgets/:id | Remove (undo sets it again) |
| GET, POST | /savings-goals | List with `percent` and `achieved` / create |
| PATCH, DELETE, POST | /savings-goals/:id, /savings-goals/:id/restore, /savings-goals/:id/contribute | Change / delete / restore / add or take out `deltaPaise` (never below 0) |
| GET | /finance/summary?month= | `{ summary }`: income, expense, net, previous month expense, by category and by day (transfers left out) |
| GET, POST | /subscriptions | `{ items, summary }` with monthly and yearly cost, `daysUntilRenewal`, `overdue` / create |
| GET | /subscriptions/upcoming?days= | Active subscriptions renewing within N days (default 30), overdue first |
| PATCH, DELETE, POST | /subscriptions/:id, /subscriptions/:id/restore, /subscriptions/:id/renew | Change (also pause or cancel) / delete / restore / mark the renewal paid: moves the renewal one cycle on and books the expense in its wallet; `{ item: { subscription, transaction }, undo }` |
| GET | /dashboard/today | Combined data for the dashboard tiles and activity feed |
| POST | /ai/chat | Send a message; response is streamed (Server-Sent Events) |
| POST | /ai/actions/:logId/confirm | Approve an external or destructive action |
| POST | /ai/actions/:logId/undo | Undo a write action |
| GET | /ai/conversations | Conversation list |
| GET | /google/connect | Start Google login (redirect) |
| GET | /google/callback | Google login callback |
| GET | /google/status | Connection status and days until re-login |
| GET | /settings | All settings |
| PATCH | /settings | Update settings |
