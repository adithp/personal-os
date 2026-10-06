# Backend API

Base URL: https://<duckdns-domain>/api/v1
Auth: every request sends Authorization: Bearer <Supabase JWT>. The backend verifies it with the Supabase JWKS (asymmetric signing keys) using the jose library: keys from <SUPABASE_URL>/auth/v1/.well-known/jwks.json, issuer <SUPABASE_URL>/auth/v1, audience authenticated. Fastify registers every route under /api/v1 itself; Caddy does not rewrite paths.
Format: JSON. Validation: Zod schemas from packages/shared.
Errors: { "error": { "code": string, "message": string } }

## Standard resource routes
Each resource has: GET list (filters, sort, page), GET by id, POST create, PATCH update, DELETE (soft delete).
Every write route calls the matching action in the action registry.

Resources: /tasks, /habits, /habit-logs, /notes, /note-folders, /note-templates, /tags, /projects, /milestones, /clients, /time-entries, /wallets, /categories, /transactions, /budgets, /savings-goals, /subscriptions, /people, /dashboards, /ai/skills

## Special routes
| Method | Path | Purpose |
|---|---|---|
| GET | /health | Server health (full path /api/v1/health, no auth). Returns {"status":"ok","time":<UTC>} |
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
