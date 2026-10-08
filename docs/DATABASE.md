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

entities: id, user_id, type (task, note, project, habit, event, email, file, transaction, subscription, person, client, tag), title, search_vector (tsvector), created_at, updated_at, deleted_at

links: id, user_id, source_id → entities, target_id → entities, relation (mentions, belongs_to, blocks, derived_from, attached, related), created_at, updated_at, deleted_at

Each module table uses the same id as its entity row.

### Rules enforced by the database (packages/db)
- entities has a unique (id, user_id) pair, and links point at that pair through two composite foreign keys (source and target). A link can therefore only join two items owned by the link's own user, even for the backend, which skips Row Level Security.
- A link cannot join an item to itself (links_no_self_link).
- There is at most one live link per user, source, target, and relation. A soft-deleted link does not block creating the same link again.
- Deleting an entity deletes its links; deleting a user deletes their entities and links.
- updated_at is refreshed by a trigger on every update of entities and links.
- Each table has one policy, "<table>_own_rows", for the authenticated role: user_id = (select auth.uid()) for both reading and writing. The anon role has no access.
- Migrations live in packages/db/drizzle. They are generated with pnpm db:generate and applied only by the owner with pnpm db:migrate. The second migration (updated_at trigger) is written by hand because drizzle-kit cannot describe functions and triggers.

## 3. Tables
### Tasks
- tasks: id (same as its entities row), title, description, status (todo, doing, done), priority (1–4, 1 is the most urgent), due_at, reminder_at, recurrence_rule (RRULE text), parent_task_id (one level only), position, completed_at, archived_at, deleted_at
- project_id and category are added in Step 5 (tags cover grouping until then).
- A task is the entity with the same id and the same owner (composite foreign key). Deleting an entity deletes its task. A task cannot be its own parent, and a subtask's parent must belong to the same user.
- Dependencies are links with relation = blocks.
- Migrations: 0002_tasks_table, and 0003_tasks_updated_at_trigger (written by hand).

### Habits
- habits: id, name, category, schedule_type (daily, weekly, custom), schedule_days (int[]), target_per_period, reminder_time, color_override, notes, archived_at
- habit_logs: id, habit_id, date, completed, value, note

### Notes
- notes: id, title, content_md, folder_id, properties (jsonb), aliases (text[]), is_daily, daily_date, pinned, favorite, archived_at
- note_folders: id, name, parent_id
- note_versions: id, note_id, content_md, created_at
- note_templates: id, name, content_md
- Wikilinks and backlinks are links with relation = mentions, rebuilt on every save.

### Tags
- tags: id, name, color. A plain table: a tag has no row in entities. The knowledge graph (Step 7) builds tag nodes from the tags table.
- entity_tags: entity_id, tag_id

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
- entities.search_vector is updated by trigger from title and module text (task description, note content).
- Semantic search uses embeddings with pgvector and cosine distance.
