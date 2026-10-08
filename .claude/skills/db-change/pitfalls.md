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
