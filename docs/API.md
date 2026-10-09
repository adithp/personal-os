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
| 404 | not_found | Unknown route, or a task or tag that does not exist (also another user's: never a 403) |
| 404 | unknown_action | POST /undo with an action name that does not exist |
| 409 | conflict | A tag rename onto an existing name |
| 409 | confirmation_required | An external or destructive action without confirmation (the app's buttons confirm, so it never hits this) |
| 409 | blocked | Reserved for completing a blocked task (Feature 3; nothing throws it yet) |
| 500 | internal_error | Anything else; the body never leaks details |
| 503 | schema_behind | The database is missing migrations (see above) |

## Standard resource routes
Each resource has: GET list (filters, sort, page), GET by id, POST create, PATCH update, DELETE (soft delete).
Every write route calls the matching action in the action registry.
Built so far: /tasks (all five, plus complete, archive, unarchive, move) and /tags (list, create, update only: no get by id and no delete yet). The other resources arrive with their module step.

Resources: /tasks, /habits, /habit-logs, /notes, /note-folders, /note-templates, /tags, /projects, /milestones, /clients, /time-entries, /wallets, /categories, /transactions, /budgets, /savings-goals, /subscriptions, /people, /dashboards, /ai/skills

Responses:
- List: `{ "items": [...] }` (tasks: filters `status`, `priority`, `tagId` (each repeatable), `dueFrom`, `dueTo`, `noDate`, `completedAfter`, `completedBefore`, `parent` (`none` = top-level, the default, or a task id for its subtasks), `archived`, `sort`, `order`, `limit`, `offset`).
- Task list details: `sort` is position (default), dueAt, priority, createdAt, or title (dueAt always puts tasks without a date last); `order` is asc (default) or desc; `limit` defaults to 500 (max 1000) and `offset` to 0; `dueFrom` is inclusive and `dueTo` exclusive (so are `completedAfter` and `completedBefore`); `noDate=true` returns only tasks with no due date; `archived=true` returns only archived tasks (default false); `status`, `priority`, and `tagId` accept one value or a repeated key.
- A task carries `tags`, `subtaskCount`, `subtasksDone`, `blockedBy` (always empty until Feature 3), and `dueAllDay`.
- Get: `{ "item": {...} }`.
- Create, update, complete, delete: `{ "item": {...}, "undo": { "action", "input" } | null }`. Create answers 201. Delete is a soft delete.
- `undo` is the way to reverse the change: send it as the body of `POST /undo`.
- Task times are ISO 8601 strings in UTC (for example `2025-10-07T11:30:00.000Z`) and must carry a zone.
- Task create and update accept `title` (1 to 500 characters), `description` (up to 20000), `status`, `priority` (1 to 4), `dueAt`, `dueAllDay`, `reminderAt`, and `tagIds` (up to 20; on update it replaces the task's tags); create and update accept `recurrenceRule` (one of the presets: `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,WE`, `FREQ=MONTHLY;BYMONTHDAY=15`, `FREQ=YEARLY`, or null on update to stop repeating; a repeating task needs a due date); update also accepts `position` (a number from -1e9 to 1e9, smaller is higher in the manual order; POST /tasks/:id/move works it out and the undo of a move uses it); create also accepts `parentTaskId` (the parent must itself be top-level). `dueAllDay: true` needs a `dueAt`; the server stores the start of that day in India time. Clearing `dueAt` on an all-day task clears the flag. `recurrenceRule` is returned but cannot be set yet (Feature 3).
- Tag input: `name` (1 to 40 characters, no spaces, no `#`) and an optional `color` (`#RRGGBB`; missing means the next color of the module palette).

## Special routes
| Method | Path | Purpose |
|---|---|---|
| GET | /health | Server health (full path /api/v1/health, no auth). Returns {"status":"ok","time":<UTC>} |
| GET | /tags | List tags: `{ items: [...] }` |
| POST | /tags | Create a tag: 201 when created; 200 with the existing tag when the name exists (ignoring case). `undo` is null |
| PATCH | /tags/:id | Rename or recolor a tag |
| POST | /tasks/:id/archive | Archive a task (returns the task and an undo) |
| POST | /tasks/:id/unarchive | Bring an archived task back |
| POST | /tasks/:id/complete | Mark a task done (returns the task and an undo) |
| POST | /tasks/:id/blockers | Body `{ blockerId }`: make that task block this one. 400 for itself, 409 `circular_dependency` for a cycle, 404 unknown. Returns the task and an undo (Feature 3: answers 501 until built) |
| DELETE | /tasks/:id/blockers/:blockerId | Stop that task from blocking this one (returns the task and an undo) |
| POST | /tasks/:id/move | Drag and drop: body `status`, `dueAt`, `dueAllDay`, `afterId` (task just above), `beforeId` (task just below), at least one; returns the task and an undo. The position goes between the two neighbours; 400 when a neighbour is the task itself, has a different parent, or `afterId` is not above `beforeId`; 404 for an unknown, deleted or other user's task or neighbour. The status and dates change exactly like in PATCH /tasks/:id |
| POST | /undo | Run the `undo` returned by a write: body `{ "action": "tasks.restore", "input": { "id": "..." } }`. Only write and destructive actions can be run this way; anything else answers 400 cannot_undo |
| GET | /me | The signed-in user from the token: {id, email, role}. Used to check that login works end to end |
| GET | /links?entityId= | Links for an entity (backlinks, project items) |
| POST | /links | Create a link |
| GET | /graph?focus=&depth=&types= | Nodes and edges for the knowledge graph |
| GET | /search?q=&mode=keyword or semantic&types= | Global search across all modules, Gmail, Drive |
| GET | /notes/:id/versions | Note history |
| POST | /notes/:id/restore/:versionId | Restore a version |
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
| GET | /finance/summary?month= | Monthly totals and category breakdown |
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
