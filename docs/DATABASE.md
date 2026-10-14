# Database

Supabase Postgres (free plan, Mumbai). Schema and migrations are written with Drizzle in packages/db.

## 1. Rules
- Every table has id (uuid), user_id (uuid, references auth.users), created_at, updated_at.
- Row Level Security is ON for every table with the policy user_id = auth.uid().
- Soft delete: deleted_at on user content tables; archive uses archived_at.
- Money: integer paise in amount_paise, currency text default 'INR'.
- Times: timestamptz in UTC.
- Public sign-up is disabled after my account is created.
- The backend connects as postgres (bypasses RLS) and scopes every query by user_id with a shared helper; RLS protects client and Realtime access.
- Migrations are generated with pnpm db:generate and applied only by me with pnpm db:migrate.

## 2. Connections model
Every item is an entity, and any two entities can be linked. This powers project pages, backlinks, the knowledge graph, global search, and AI context.

entities: id, user_id, type (task, note, project, habit, event, email, file, transaction, subscription, person, client, goal; the enum also has tag, which is unused because tags are a plain table), title, search_vector (tsvector), created_at, updated_at, deleted_at

links: id, user_id, source_id → entities, target_id → entities, relation (mentions, belongs_to, blocks, derived_from, attached, related), created_at, updated_at, deleted_at

Each module table uses the same id as its entity row.

### Rules enforced by the database (packages/db)
- entities has a unique (id, user_id) pair, and links point at that pair through two composite foreign keys (source and target). A link can therefore only join two items owned by the link's own user, even for the backend, which skips Row Level Security.
- A link cannot join an item to itself (links_no_self_link).
- There is at most one live link per user, source, target, and relation. A soft-deleted link does not block creating the same link again.
- Deleting an entity deletes its links; deleting a user deletes their entities and links.
- updated_at is refreshed by a trigger (set_updated_at(), migration 0001) on every update of entities, links, tasks, tags, entity_tags, task_favorites, and goals.
- Each table has one policy, "<table>_own_rows", for the authenticated role: user_id = (select auth.uid()) for both reading and writing. The anon role has no access (for the Realtime tables this is also a real REVOKE, migration 0011).
- Migrations live in packages/db/drizzle. They are generated with pnpm db:generate and applied only by the owner with pnpm db:migrate. Migrations 0001, 0003, 0005, 0007, 0009, 0011, 0013 and 0015 (triggers, Realtime publication and grants) are written by hand because drizzle-kit cannot describe functions and triggers. The server reads the migration list at startup and warns (and answers 503 schema_behind) while the database is missing migrations; it never applies them.

## 3. Tables
### Tasks
- tasks: id (same as its entities row), title, description, status (todo, doing, done), priority (1–4, 1 is the most urgent), due_at, reminder_at, recurrence_rule (RRULE text), parent_task_id (one level only), position, completed_at, archived_at, deleted_at
- project_id and category are added in Step 5 (tags cover grouping until then).
- A task is the entity with the same id and the same owner (composite foreign key). Deleting an entity deletes its task. A task cannot be its own parent, and a subtask's parent must belong to the same user.
- Dependencies are links with relation = blocks. The source is the blocker and the target the blocked task. Removing a blocker soft-deletes the link (the unique index covers live links only, so it can be added again). A done or deleted blocker no longer blocks; an archived one does. Cycles and self links are refused by the server.
- due_all_day (boolean, default false): an all-day task stores the start of that day in India time in due_at and shows the date only.
- Soft-deleting a task also soft-deletes its entities row; restoring brings both back. Renaming a task updates entities.title. Subtasks are not touched when their parent is soft-deleted (they are only reachable through the parent); a hard delete of the parent removes them (tasks_parent_fk cascades).
- Checks and indexes: priority between 1 and 4 (tasks_priority_range), indexes on user, user and status, user and due date, and parent.
- Migrations: 0002_tasks_table, 0003_tasks_updated_at_trigger (by hand), 0004_tags_and_all_day, 0005_tags_updated_at_trigger (by hand).

### Habits
- habits: id, name, category, schedule_type (daily, weekly, custom), schedule_days (int[]), target_per_period, reminder_time, color_override, notes, archived_at
- habit_logs: id, habit_id, date, completed, value, note

### Notes
- notes (stage N1, migration 0012): id (the id of its entities row, type `note`; composite foreign key with cascade), user_id, title, content_md (Markdown, the source of truth, up to 200,000 characters), content_text (plain text made by the server on every save, for search and list excerpts), folder_id (composite foreign key to note_folders), pinned, revision (starts at 1, goes up on every content or title change, used to detect edits from another device), created_at, updated_at, deleted_at. A live title is unique per user ignoring case (index notes_user_title_idx). Triggers (migration 0013): updated_at, and the search vector (title weight A, content_text weight B, simple configuration). daily_date (N3, migration 0014) is described below. properties, aliases, favorite and archived_at are not built
- note_folders (N1): id, user_id, name, parent_id (composite self foreign key), deleted_at. A live name is unique inside its parent ignoring case (two partial indexes, one for top-level folders); the server limits the depth to 3. A plain table, not an entity
- note_versions (stage N4, migration 0016): id, user_id, note_id (composite foreign key to notes with user_id, cascade, so versions go when a note is purged), title, content_md, reason (`auto`, `before_restore` or `conflict`, check note_versions_reason_check), created_at. No updated_at and no deleted_at: rows are only added, and the oldest are deleted so 50 per note remain. Index note_versions_note_created_idx on (note_id, created_at desc). RLS own rows. Not in the Realtime publication (not shown live) No GRANT to anon or authenticated: the desktop reads versions only through the API (the backend role bypasses RLS). Check after `pnpm db:migrate` that the table has RLS on and no anon or authenticated privileges.
- notes.daily_date (stage N3, migration 0014): date, null for a normal note; the India day of a daily note. Unique per user among live notes (index notes_user_daily_date_idx)
- note_templates (stage N3, migrations 0014 and 0015): id, user_id, name, content_md (default empty), is_daily_default (default false), created_at, updated_at, deleted_at. A plain table, not an entity. A live name is unique per user ignoring case (note_templates_user_name_idx); at most one live template per user has is_daily_default (note_templates_daily_default_idx). RLS own rows; updated_at trigger; in the Realtime publication (SELECT for authenticated, none for anon)
- Wikilinks and backlinks are links with relation = mentions, rebuilt on every save.

### Tags
- tags: id, user_id, name (unique per user ignoring case among live tags), color (a palette hex), deleted_at. A plain table: a tag has no row in entities. The knowledge graph (Step 7) builds tag nodes from the tags table.
- entity_tags: entity_id, tag_id (a task can only get tags of the same user, enforced by composite foreign keys; each pair once). entity_tags rows are hard-deleted (no deleted_at); soft-deleting a tag does not remove its rows, and task reads ignore tags that are soft-deleted. tags.delete and tags.merge do remove the task links of the tag (hard delete, only rows of tasks) in the same step, and the undo re-creates them from the task ids it carries; they also edit the view of favorites: a deleted tag id is removed from the view (a favorite left with an empty view is soft-deleted) and a merge replaces the id with the target id Note tags use this table too: a note has one row per distinct `#tag` in its text, rebuilt on every content save. tags.delete is refused (409 tag_in_notes) while a live note has the tag, so it removes only task rows (trashed notes keep theirs). tags.merge rewrites `#source` to `#target` in the text of every note, trashed ones too, so the note rows follow the text.

### Goals
- goals: id (the id of its entities row, type `goal`; composite foreign key with cascade), user_id, title, description (the notes), target_at (the start of the target day in India time), status (`active`, `achieved`, `dropped`), closed_at, created_at, updated_at, deleted_at. RLS own rows; updated_at trigger (migration 0009). A task joins a goal through a live `belongs_to` link (task to goal); one goal per task, top-level tasks only; the server checks that the link target is a goal because projects (Step 5) will share `belongs_to`. Progress is computed from the linked tasks, never stored. Migrations 0008 (enum value `goal`, enum `goal_status`, table; the new enum value is not used in that file, and a later migration must not use `'goal'` in the same run) and 0009 (the trigger). Indexes `goals_user_id_idx` and `goals_user_status_idx`; the id has a unique (id, user_id) pair and cascades with its entities row and its user; the status defaults to `active`. Deleting a goal soft-deletes the goals row and its entities row and keeps the links, restoring brings both back; renaming a goal updates `entities.title`; linking a task to another live goal soft-deletes the old link (links to a deleted goal stay).

### Task favorites
- task_favorites: id, user_id, name (1 to 40), color (a palette color), icon (one of 12 icon names), view (jsonb: the saved My tasks view: status, priority, tagIds, due, archived, group, sort; at least one key; checked by the shared favoriteViewSchema), position (a number between neighbours, like tasks.position), created_at, updated_at, deleted_at. A plain table (not an entity); RLS own rows; at most 12 live favorites per user (checked by the server); updated_at trigger (migration 0007). Migrations 0006 and 0007.

### Calendar
- calendars: id, google_calendar_id, name, color, visible
- events: id, calendar_id, google_event_id, title, description, start_at, end_at, all_day, recurrence, location, reminder_minutes, etag

### Mail and Drive references
- email_refs: id, gmail_message_id, thread_id, from_address, subject, snippet, received_at, labels (text[]), is_important, needs_reply
- file_refs: id, drive_file_id, name, mime_type, web_link, modified_at, parent_folder_id

### Projects
- projects: id, name, type (freelance, college, personal, software), status (planned, active, on_hold, done), client_id, start_date, due_date, description, progress
- milestones: id, project_id, name, due_date, done
- clients: id, name, email, phone, company, notes
- time_entries: id, project_id, task_id, started_at, ended_at, minutes, note

### Money
- wallets: id, name, type (cash, bank, card, upi, other), balance_paise, currency
- categories: id, name, kind (income, expense), icon
- transactions: id, wallet_id, category_id, kind (income, expense, transfer), amount_paise, occurred_at, note, project_id, transfer_wallet_id, recurring_rule_id
- recurring_rules: id, rrule, template (jsonb), next_run_at
- budgets: id, category_id, month (date), limit_paise
- savings_goals: id, name, target_paise, saved_paise, due_date
- subscriptions: id, name, category, amount_paise, billing_cycle (monthly, yearly), next_renewal_at, wallet_id, remind_days_before, active

### People
- people: id, name, email, notes

### Dashboard and settings
- dashboards: id, name, layout (jsonb), widgets (jsonb), is_default
- settings: id, key, value (jsonb)

### AI
- ai_skills: id, name, description, instructions, allowed_actions (text[]), context_sources (text[]), model_route (fast, smart), enabled
- ai_conversations: id, title, created_at
- ai_messages: id, conversation_id, role, content, tool_calls (jsonb), created_at
- ai_action_log: id, conversation_id, action, input (jsonb), result (jsonb), permission, status (done, pending_confirmation, undone, failed), created_at
- embeddings: id, entity_id, chunk_index, content, embedding (vector), updated_at

### Integrations
- google_accounts: id, email, scopes (text[]), refresh_token_encrypted, access_token_encrypted, expires_at, history_id, calendar_sync_token, drive_page_token

### Reminders
- reminders: id, entity_id, remind_at, sent_at, channel (desktop, mobile)

## 4. Search
- entities.search_vector (tsvector) has a GIN index (entities_search_vector_idx). For tasks, migration 0010_tasks_search_vector.sql fills it with triggers on tasks (insert, and update of title or description): title weight A, description weight B, `simple` configuration (no stemming, no stop words; decision 42), and backfilled existing tasks (which also refreshed their entities.updated_at). Other modules add their own trigger when they join search.
- Queries (apps/server/src/lib/search.ts, the only full-text SQL): each typed word becomes a prefix term (word:*), joined by AND, matched with @@ and ranked with ts_rank(..., 1). Snippets use ts_headline with empty markers (plain text). Tags have no search vector: they are matched with lower(name) LIKE 'word%'.
- Semantic search uses embeddings with pgvector and cosine distance.

## 5. Realtime
- Migration 0011_realtime_publication.sql adds the tables in `REALTIME_TABLES` (packages/shared/src/realtime.ts: tasks, tags, entity_tags, task_favorites, links, goals) to the `supabase_realtime` publication (skipping any already added), runs `GRANT SELECT ... TO authenticated` and `REVOKE ALL ... FROM anon` on them. Replica identity stays default. Supabase stops granting new `public` tables to the API roles on 30 October 2026, so a new table that screens show needs its own grants and an entry in `REALTIME_TABLES` in the same feature (db-change skill).
- Check after `pnpm db:migrate`: `select tablename from pg_publication_tables where pubname = 'supabase_realtime';` lists the six tables; `select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'tasks';` shows SELECT for authenticated and nothing for anon.
