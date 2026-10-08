---
name: db-change
description: Change the database schema with Drizzle: new tables, columns, enums, RLS policies, triggers, and migrations, then tell the owner exactly which migration files to apply. Use for anything in packages/db. Never runs pnpm db:migrate.
---

# db-change: schema and migrations

The owner applies migrations with `pnpm db:migrate`. Claude never runs it (it is denied). Read `pitfalls.md` here first.

## Table template (`packages/db/src/schema/<name>.ts`, export it from `schema/index.ts`)
```ts
export const things = pgTable('things', {
  ...baseColumns(),          // id uuid, user_id, created_at, updated_at
  title: text('title').notNull(),
  ...deletedAtColumn(),      // deleted_at, for user content (soft delete)
}, (table) => [
  index('things_user_id_idx').on(table.userId),
  ownRowsPolicy('things', table.userId),   // RLS: user_id = auth.uid()
]).enableRLS();
```
- Every table has `user_id` and RLS on (rule 3). The backend connects as `postgres` and skips RLS, so the code also filters by `user_id` through the `UserScope` helper; RLS protects the app's and Realtime's own access.
- **An item of the app** (task, note, project, …) uses the same `id` as its `entities` row: a composite foreign key `(id, user_id) → entities (id, user_id)` with `onDelete('cascade')`, and `unique(id, user_id)` so others can point at it. Links between tables use composite foreign keys with `user_id` so a row can only point at the same user's rows.
- Money is integer paise (`amount_paise`). Times are `timestamp(..., { withTimezone: true })` in UTC.
- Unique names per user: `uniqueIndex(...).on(table.userId, sql\`lower(...)\`).where(sql\`deleted_at is null\`)`.
- Enums that mirror a shared constant: `pgEnum('name', SHARED_CONSTANT)`. Adding a value later is an `ALTER TYPE ... ADD VALUE` migration.

## Generate the migration
1. `pnpm db:generate` is the same as `drizzle-kit generate`. Give it a clear name: `cd packages/db && pnpm exec drizzle-kit generate --name=things_table`.
2. **Hand-written SQL** (triggers, functions, enum changes, Realtime publication): `pnpm exec drizzle-kit generate --custom --name=things_updated_at_trigger`, then write the SQL in the new file. The `updated_at` trigger reuses `public.set_updated_at()` from migration 0001:
   ```sql
   CREATE TRIGGER "things_set_updated_at" BEFORE UPDATE ON "public"."things"
     FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
   ```
   Separate statements with `--> statement-breakpoint`.
3. Run `pnpm exec drizzle-kit generate` once more: it must say "No schema changes". Never edit the files in `drizzle/meta` by hand (Prettier ignores them).
4. Update the packages/db tests: the migration list and table list in `src/schema.test.ts`, the `truncate` statements in tests that clear tables, and add tests for the new table (constraints, cascade, RLS with `asRole`, anonymous role has no access, trigger).
5. Update docs/DATABASE.md (docs-sync skill).

## The message to the owner (always send it)
List the **new migration files** by name, and say what to check in Supabase afterwards: the new tables with RLS on and their policy names (`<table>_own_rows`), new columns with type and default, new triggers, and the row count of `drizzle.__drizzle_migrations`. Say plainly that the app shows "Database update needed: run pnpm db:migrate" until it is applied (the server checks at startup).

## Later (not built yet)
Realtime: a migration adds the table to the `supabase_realtime` publication (Step 2 feature "Realtime updates").
