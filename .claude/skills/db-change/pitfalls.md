# Pitfalls: db-change

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10: Prettier reformatted the generated drizzle meta files
- Symptom: Noisy diffs in packages/db/drizzle/meta after prettier --write
- Cause: Prettier formats every JSON file
- Fix: packages/db/drizzle/meta/ is in .prettierignore
- Prevention: guarded, .prettierignore and scripts/repo-guards.test.mjs

### 2026-10-09: An unapplied migration made the UI show a generic 500 ("column does not exist")
- Symptom: Overview and Tasks showed "something went wrong"; the server log said column "due_all_day" does not exist
- Cause: The new migrations were generated but not applied (the owner applies them)
- Fix: A read-only startup check compares the journal with drizzle.__drizzle_migrations; schema errors answer 503 "Database update needed: run pnpm db:migrate". Reports always list the new migration files
- Prevention: guarded, apps/server/src/lib/schema-guard.ts and tests: startup warning and 503 schema_behind; the desktop shows the message

### 2026-10-14: New tables need explicit privileges (Supabase stops auto-granting on 30 Oct 2026)
- Symptom: A new table has RLS but no REVOKE for anon and no GRANT for authenticated; Realtime would fail silently
- Cause: Supabase default grants on public tables are going away; PGlite tests grant everything
- Fix: The Realtime migration revokes anon and grants authenticated read on the tables the app shows
- Prevention: documented, db-change pitfalls; check information_schema.role_table_grants after db:migrate

### 2026-10-14: a generated migration can get an older `when` than the one before it
- Symptom: schema-guard test said the migration timestamps were out of order
- Cause: drizzle-kit stamps `when` from the clock; after many agent-made files the new one was older than 0016, and drizzle's migrator skips a migration whose `when` is not newer than the last applied one
- Fix: edit `when` in packages/db/drizzle/meta/_journal.json so it is larger than the previous entry
- Prevention: after generating migrations check that the `when` values in the journal only go up (the schema-guard test checks it)
