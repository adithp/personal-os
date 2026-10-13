# Research memo: Realtime updates (ROADMAP Step 2)

Date: 2026-10-13. Author: research agent (decisions delegated by the owner, to be reviewed later).
No mockup: the only visible parts are screens that refresh by themselves and one status row in Settings.

## 1. What is already decided (not redone here)
- apps/desktop/CLAUDE.md: "Subscribe to Supabase Realtime and invalidate the matching queries on change; until then mutations invalidate their own queries."
- docs/ARCHITECTURE.md section 2: apps subscribe to Realtime on their own rows; on a change event TanStack Query refetches the affected data **from the backend**. Realtime is only a "something changed" signal; the backend stays the only read path.
- The desktop holds only the anon key and the user's session (docs/SECURITY.md). The backend writes as `postgres` (skips RLS); RLS (`<table>_own_rows`, `user_id = (select auth.uid())`, authenticated role only) protects everything that reaches the database with the user's token, Realtime included (decision 22).
- Query keys today: every task list, task detail and the report start with `['tasks']` (`TASKS_KEY`, `reportKey` = `['tasks','report',period]`); tags `['tags']`; favorites `['task-favorites']`. The dashboard tile uses the tasks hooks. Mutations already invalidate their own keys in `onSettled`.

## 2. What the research found
Every point comes from a page I opened or from the installed library code I read (versions from pnpm-lock: @supabase/supabase-js 2.117.2, @supabase/realtime-js 2.117.2, @tanstack/react-query 5.104.1). Points seen only in search summaries are marked **unverified**.

### Supabase Realtime, Postgres Changes
- A table sends changes only after it is added to the `supabase_realtime` publication: `alter publication supabase_realtime add table <t>;` [S1][S3]. The troubleshooting guide's check: `select * from pg_publication_tables where pubname = 'supabase_realtime';` [S3].
- One channel can carry several `.on('postgres_changes', { event, schema, table, filter }, cb)` listeners [S1]. Filters use `column=op.value` (`eq`, `neq`, `lt`, `in` up to 100 values, ...) [S1].
- RLS: Realtime impersonates each subscriber (role + JWT claims) and selects the changed row by primary key; only rows the subscriber may SELECT are delivered [S7]. RLS is the most common reason for "silently missing" events [S3]. If the subscriber's role lacks SELECT privilege on the table, walrus returns "Unauthorized" for that subscriber [S7].
- DELETE: "RLS policies are not applied to DELETE statements" [S1]. Walrus: the `old_record` of a delete "will be broadcast to all subscribers to that table so ensure that each table's replica identity only contains information that is safe to expose publicly" [S7]. Delete events can only be filtered when the table has replica identity FULL [S1].
- REPLICA IDENTITY: by default `old` holds only the primary key; FULL adds the old values, **but on an RLS table the old record still contains only the primary key** [S3]. UPDATE delivery is checked against the new row [S7]. (A third-party PR claiming UPDATEs stop without FULL could not be opened, 404: **unverified**, and it contradicts walrus's own description.)
- Scale: each change is checked once per subscriber, sequentially; Supabase recommends Broadcast for many subscribers (over about 3,000) [S1][S4]. The "subscribing to database changes" guide calls Broadcast "the recommended method for scalability and security" and Postgres Changes "simpler" [S4].
- There is a timing gap between the client reporting SUBSCRIBED and the replication listener being ready [S3].

### Free plan limits [S2]
200 concurrent connections, 100 messages per second, 100 channel joins per second, 100 channels per connection, Postgres change payload 1,024 KB (above it, only fields of 64 bytes or less are kept). When message rates are exceeded "connections disconnect; the supabase-js client reconnects automatically once rates drop".

### Broadcast from Database (the alternative) [S4][S5]
A trigger per table calls `realtime.broadcast_changes(topic, ...)`; clients join a **private** channel after `supabase.realtime.setAuth()`; an RLS policy on `realtime.messages` decides who may receive; every message is stored in `realtime.messages` for 3 days (daily partitions).

### Token refresh, reconnect, sleep (library code read locally)
- supabase-js `SupabaseClient._handleTokenChanged`: on `SIGNED_IN`, `INITIAL_SESSION` or `TOKEN_REFRESHED` it calls `realtime.setAuth(token)`; on `SIGNED_OUT` it calls `realtime.setAuth()` (back to the anon key). The client also passes `accessToken` to RealtimeClient, and every heartbeat "sent" calls `_setAuthSafely()`. So **token refresh needs no code of ours**, as long as Realtime uses the same Supabase client as auth.
- realtime-js `RealtimeClient`: heartbeat every 25 s, reconnect after 1, 2, 5, then 10 s; `channel(topic)` **returns the existing channel when the topic is already in use** (important for React StrictMode double effects); `worker: true` starts the heartbeat in a Worker built from a **blob: URL**.
- Supabase's guide for silent disconnections in background apps: timers are throttled when hidden, heartbeats stop, the server closes the socket; it recommends `worker: true` plus a `heartbeatCallback` that calls `connect()` on 'disconnected' [S6]. In the installed 2.117.2 the wrapper `_wrapHeartbeatCallback` returns early on 'disconnected' and never calls our callback, so that half of the advice does not apply to this version (read in code, behaviour not run).
- Subscribe statuses: SUBSCRIBED, TIMED_OUT, CLOSED, CHANNEL_ERROR (RealtimeChannel.js). That the join's "ok" fires SUBSCRIBED again after an automatic rejoin follows from Phoenix push semantics but I did not run it: **unverified**, covered by manual test step 6.

### Tauri / WebView2
- CSP (`apps/desktop/src-tauri/tauri.conf.json`): `connect-src` already has `wss://*.supabase.co` in both `csp` and `devCsp`. Realtime's URL is `wss://<ref>.supabase.co/realtime/v1/websocket`, so **no CSP change** is needed. There is no `worker-src`, so it falls back to `script-src 'self'` and a blob: worker would be blocked; `worker: true` would need a CSP change.
- Tauri's `backgroundThrottling` window option (since 2.3.0) works on macOS 14+/iOS 17+ only; **Windows (WebView2) is not implemented** [S13][S14]. So a minimized window can lose its socket; we must recover on wake rather than try to prevent it.

### Supabase grants change (affects us directly)
- Supabase changelog, 28 April 2026: new tables in `public` are **no longer granted** to anon, authenticated and service_role automatically. Default for new projects from 30 May 2026, applied to all existing projects on **30 October 2026** (17 days from today). "RLS behavior remains unchanged. Grants are a separate layer." [S8]
- Combined with walrus's privilege check [S7]: a table without `grant select ... to authenticated` sends **no Realtime events** to the app, silently. Whether our current tables have that grant depends on when the owner's project was created and when each migration ran: **unverified** (I cannot see the database). Old projects also gave **anon** full grants, so an anonymous socket (the anon key is public) could receive DELETE primary keys of our tables [S7].
- The PGlite test stand-in (`packages/db/src/testing.ts`) grants everything to authenticated after the migrations, so tests would not catch a missing grant.

### PGlite check (run locally)
I ran PGlite from packages/db: `create publication supabase_realtime`, `alter publication ... add table` and `pg_publication_tables` all work; adding the same table twice errors ("already member of publication"); a guarded `DO $$ ... $$` block runs twice without error; `GRANT SELECT ... TO authenticated` and `REVOKE ALL ... FROM anon` work and `has_table_privilege` reports them. So the migration can be tested like the others.

### TanStack Query
- TkDodo (maintainer): for websocket events prefer **invalidation** over writing data into the cache (`setQueryData`): it handles adds and deletes, only refetches what is on screen, and inactive queries just become stale [S9]. He suggests `staleTime: Infinity` when a socket pushes updates [S9].
- Concurrent optimistic updates: an invalidation that lands while another optimistic mutation is pending can overwrite the optimistic cache and make the UI flicker; check `queryClient.isMutating()` before invalidating [S10][S11].
- query-core 5.104.1 code: `invalidateQueries` marks matches stale and refetches with `refetchType` (default `'active'`); `cancelRefetch` defaults to **true** (a running fetch is cancelled and restarted) [S11, code].

## 3. Decisions
Confidence: High, Medium, Low.

**D1. Transport: Postgres Changes, not Broadcast.** One user, at most a few sockets (desktop now, phone later), so the per-subscriber RLS cost [S1] does not matter. Postgres Changes needs only the publication and grants: no triggers, no `realtime.messages` policies, no private channels, no 3-day message storage on the free 500 MB database [S5]. Rejected: Broadcast from Database (more SQL per table and one more RLS surface for no gain at our scale); a server-sent events stream from Fastify (new endpoint, keep-alive behind Caddy, and the server would need LISTEN/NOTIFY or a hook in every action; Supabase already does this). Revisit only if the app ever gets many users. Confidence: High.

**D2. Tables: tasks, tags, entity_tags, task_favorites, links.** These are everything the Tasks screens read: `links` carries blockers, `entity_tags` carries a task's tags (tasks.update of tags may not touch the tasks row). Not `entities`: today every entity change also changes its module row (rename updates both), so it would only double events; add it when global search or the graph reads it. Tables built before this feature (Goals, full-text search) are added by the builder if they exist; Notes tables join when Notes is built. The list lives once in packages/shared as `REALTIME_TABLES` (rule 7) so the migration test and the app use the same names. Confidence: High.

**D3. Migration: publication + SELECT grant to authenticated + revoke from anon; replica identity stays DEFAULT.**
- Guarded publication add (idempotent, because the owner may already have flipped a table's Realtime toggle in the dashboard, and a plain `ADD TABLE` would then fail).
- `GRANT SELECT` to authenticated: required for delivery [S7], and from 30 October Supabase no longer grants it on new tables [S8]. Only SELECT: the app never writes to Supabase directly (rule 1).
- `REVOKE ALL ... FROM anon`: anon has no policy, but DELETE events skip RLS and go to all subscribers [S1][S7]; without the privilege walrus refuses them. Harmless for us (the anon role is never used; the backend is `postgres`).
- REPLICA IDENTITY: keep DEFAULT. We never read `old`; on RLS tables FULL still gives only the key [S3]; DEFAULT keeps delete payloads to a uuid [S7]; FULL would add WAL volume. Confidence: High (publication, identity), Medium (anon revoke: correct by walrus docs, but its effect on the live project is unverified).

**D4. Channel design: one channel per signed-in session, five listeners, each `event: '*'` with `filter: user_id=eq.<uid>`.** Topic `user-changes-<n>` where n is a counter, because `channel(topic)` returns an existing channel with the same topic and a StrictMode remount could get a channel that is still closing (realtime-js code). RLS is the real guard; the filter is defence in depth and saves the server work. DELETE events are not filterable [S1] and arrive anyway (with RLS they are still only ours, since we revoke anon and there is one user). The callback ignores the row payload completely: it uses only `payload.table`. Confidence: High.

**D5. Event to query keys: a small registry the modules extend.** `apps/desktop/src/realtime/registry.ts` holds `Record<RealtimeTable, QueryKey[]>` built from module entries; the Tasks module adds `modules/tasks/realtime-keys.ts`:
| Table | Keys invalidated |
|---|---|
| tasks | `['tasks']` (lists, details, report, dashboard tile) |
| tags | `['tags']`, `['tasks']` (rows show tag names and colors) |
| entity_tags | `['tasks']`, `['tags']` (tags carry `taskCount`) |
| task_favorites | `['task-favorites']` |
| links | `['tasks']` (blockers) |
A table with no entry is ignored. Invalidation, not `setQueryData` [S9]. Confidence: High.

**D6. Coalescing: a 300 ms batch window.** The first event starts a 300 ms timer; every event in that window adds its keys to a Set; then each distinct key is invalidated once (default `refetchType: 'active'`, so hidden pages only go stale). A window (not a sliding debounce) bounds the delay to about 300 ms even during a stream of events, and a bulk action (tags.merge can touch up to 5000 rows) becomes one refetch per key. Confidence: Medium (300 ms is a judgment call; any 200 to 500 ms works).

**D7. Own writes (echo): no filtering, only a deferral while mutating.** At flush time, if `queryClient.isMutating() > 0`, keep the keys and try again in 300 ms, so an event never overwrites an optimistic update that is still pending [S10]. After the mutation settles, its own `onSettled` refetch and ours may overlap; with the default `cancelRefetch: true` the second simply restarts the first, so the cost is at most one extra GET per own write. Rejected: tagging writes with a client id (needs a column or header on every action, and the server would have to echo it), and "ignore events for N ms after my mutation" (would also swallow a real change from the AI or another device in that window). Confidence: Medium.

**D8. Reconnect, wake from sleep, token refresh.**
- realtime-js reconnects and rejoins by itself (1, 2, 5, 10 s; 25 s heartbeat). Every SUBSCRIBED **after the first one** of a session means we may have missed events, so it invalidates every key in the registry (one refetch of what is on screen). The first SUBSCRIBED does nothing (the screens just loaded; the small start gap [S3] is covered by the next bullet).
- Safety nets stay on: `refetchOnWindowFocus: true`, `staleTime: 15 s`, TanStack's default refetch on network reconnect. We do **not** move to `staleTime: Infinity` [S9], because Windows WebView2 cannot stop background throttling [S13] and the free plan disconnects on bursts [S2], so Realtime alone can miss things.
- No `worker: true` (needs a CSP `worker-src blob:` change, and the window-focus refetch already covers wake-up) and no `heartbeatCallback` (ignored on 'disconnected' in 2.117.2).
- Token refresh: nothing to build; supabase-js passes refreshed tokens to Realtime itself. Realtime must use the **same** Supabase client as auth. Confidence: High (token), Medium (re-SUBSCRIBED after rejoin, see manual test 6).

**D9. Logged out and misconfigured.** The sync follows `auth.store`: signed in, start the channel (needs the user id, so `AuthState` gains `userId`); signed out, `removeChannel` and status "off"; misconfigured env, never starts. supabase-js already resets Realtime's token on SIGNED_OUT. Confidence: High.

**D10. Status: one read-only row in Settings, Account card: "Live updates", with "On", "Connecting...", "Reconnecting..." or "Off".** No dot in the title bar or dock (minimal design; the owner rarely needs it). It also makes the feature testable. States come from the subscribe callback: SUBSCRIBED gives On; CHANNEL_ERROR, TIMED_OUT or CLOSED while signed in gives Reconnecting; before the first SUBSCRIBED, Connecting; signed out, Off. Kept in a tiny Zustand store `realtime/realtime-store.ts`. Confidence: Medium (could be dropped entirely; it costs one row).

**D11. No Settings toggle.** It is cheap (one socket, a few messages), and a switch adds a state to test for no benefit. Confidence: High.

**D12. CSP: no change.** `wss://*.supabase.co` is already in `csp` and `devCsp`. Confidence: High.

**D13. Errors are never shown as toasts and payloads are never logged** (they contain task text; docs/SECURITY.md "Logs never contain ... file contents" spirit). A CHANNEL_ERROR only changes the status row. Confidence: High.

**D14. Tests.**
- packages/db: migration list; `pg_publication_tables` for `supabase_realtime` equals `REALTIME_TABLES`; `has_table_privilege('authenticated', t, 'SELECT')` true and `has_table_privilege('anon', t, 'SELECT')` false for each. The PGlite stand-in gains `create publication supabase_realtime;` (Supabase creates it in every project). Note: the stand-in's later blanket grant to authenticated must not hide a missing grant, so check privileges for anon (revoke) and keep the authenticated check as documentation.
- packages/shared: `REALTIME_TABLES` is a readonly tuple; a type test that every entry is a real table name is not needed.
- apps/desktop: `src/test/fake-realtime.ts`, a fake with `channel()`, `on()`, `subscribe(cb)`, `removeChannel()` that records bindings and lets a test call `emit(table)` and `setStatus(status)` (same pattern as `fake-auth.ts`). Unit tests of `realtime-sync.ts` with fake timers: an event invalidates the mapped keys after 300 ms; ten events in a window give one invalidation per key; an unknown table is ignored; a pending mutation defers the flush; a second SUBSCRIBED invalidates all registry keys and the first does not; sign-in subscribes with `user_id=eq.<id>`; sign-out removes the channel; StrictMode double start uses two topics. One Settings test for the status row text. No real socket in tests. Confidence: High.

**D15. Security review points (what a hostile client could do).**
1. Anyone has the anon key (public by design). With the anon revoke, an anonymous socket gets "Unauthorized" for our tables, including DELETE keys [S7].
2. Public sign-up is disabled, so no second authenticated user exists; even if one did, RLS limits INSERT/UPDATE events to own rows, and DELETE events carry only a uuid (DEFAULT identity).
3. A client-chosen filter can only narrow, never widen, what RLS allows.
4. A stolen JWT lets the holder watch the owner's changes until it expires: the same exposure as calling the API with it. Writes through PostgREST with that JWT are a separate, existing risk (see section 5, change 2).
5. The app trusts nothing in the payload: the table name only picks keys from a fixed map; the data itself always comes from the backend.
6. An event flood costs at most one refetch per key per 300 ms.
7. Only the anon key and the session live in the app (rule 2 unchanged).
Confidence: High.

**D16. Out of scope.** Writing payloads into the cache; Presence; Broadcast; the mobile app; Notes, habits and other future tables (each joins when built, see section 5 change 3); server-side listeners; offline write queues; a toggle; notifications. Confidence: High.

## 4. Migration SQL outline
File: the next free number, for example `packages/db/drizzle/0008_realtime_publication.sql`, made with `pnpm exec drizzle-kit generate --custom --name=realtime_publication` (a hand-written migration; `drizzle-kit generate` must then say "No schema changes").

```sql
-- Realtime (Postgres Changes) for the tables the open screens show. Written by hand.
-- Idempotent: a table already added (for example with the dashboard toggle) is skipped.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks', 'tags', 'entity_tags', 'task_favorites', 'links'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- Realtime only delivers rows the subscriber's role may SELECT; Supabase stops granting new tables
-- automatically on 2026-10-30. RLS (<table>_own_rows) still decides which rows.
GRANT SELECT ON public.tasks, public.tags, public.entity_tags, public.task_favorites, public.links TO authenticated;
--> statement-breakpoint
-- DELETE events skip RLS; without any privilege the anon role receives nothing.
REVOKE ALL ON public.tasks, public.tags, public.entity_tags, public.task_favorites, public.links FROM anon;
```
No `REPLICA IDENTITY` statement (D3). Checked in PGlite: runs, runs twice, privileges as expected. The danger-word test (DROP TABLE, TRUNCATE, DELETE FROM, ...) still passes.

What the owner checks in Supabase after `pnpm db:migrate`: Database, Publications, `supabase_realtime` lists the five tables (or run `select tablename from pg_publication_tables where pubname = 'supabase_realtime';`); `select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'tasks';` shows SELECT for authenticated and nothing for anon; the row count of `drizzle.__drizzle_migrations` went up by one.

## 5. TypeScript module outline
```
packages/shared/src/realtime.ts
  export const REALTIME_TABLES = ['tasks','tags','entity_tags','task_favorites','links'] as const;
  export type RealtimeTable = (typeof REALTIME_TABLES)[number];

apps/desktop/src/realtime/
  realtime-source.ts   type RealtimeSource = Pick<SupabaseClient, 'channel' | 'removeChannel'>
  registry.ts          realtimeKeys: Record<RealtimeTable, QueryKey[]> (merges module entries)
  realtime-sync.ts     startRealtimeSync({ source, auth, queryClient, registry, windowMs = 300 }): () => void
                       - follows auth.store (signedIn + userId) ; one channel per session, topic user-changes-<n>
                       - .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, () => queue(table))
                       - queue -> Set of keys -> flush after windowMs; defer while queryClient.isMutating() > 0
                       - subscribe(status): updates realtime-store; second+ SUBSCRIBED -> invalidate all keys
                       - stop(): removeChannel, clear timer, status 'off'
  realtime-store.ts    Zustand: status 'off' | 'connecting' | 'live' | 'reconnecting'
  realtime-sync.tsx?   <RealtimeSync source auth /> inside AppProviders: useQueryClient + useEffect(start/stop)
  realtime-sync.test.ts
apps/desktop/src/modules/tasks/realtime-keys.ts   the Tasks rows of the D5 table
apps/desktop/src/test/fake-realtime.ts             fake channel (emit, setStatus, bindings, removed)
```
Wiring: `auth/supabase-client.ts` creates the Supabase client once and returns both the auth and the client as the realtime source (for example `createClientsFromEnv(raw): { auth, realtime: RealtimeSource | null }`, keeping `createAuthFromEnv` if its test needs it); `main.tsx` passes `realtime` and `auth` to `AppProviders`, which renders `<RealtimeSync>` only when a source is given (so `render-app.tsx` and every existing test stay unchanged). `AuthState` gains `userId` (`session.user.id`); `fake-auth.ts` sessions get an `id`.

## 6. Files likely touched
- New: `packages/shared/src/realtime.ts` (+ export in `index.ts`, small test); `packages/db/drizzle/0008_realtime_publication.sql` (+ drizzle meta from the generator); `apps/desktop/src/realtime/*` (above); `apps/desktop/src/modules/tasks/realtime-keys.ts`; `apps/desktop/src/test/fake-realtime.ts`.
- Changed: `packages/db/src/testing.ts` (stand-in publication); `packages/db/src/schema.test.ts` (migration list, publication, privileges); `apps/desktop/src/auth/auth.ts`, `supabase-client.ts` (+ tests); `apps/desktop/src/test/fake-auth.ts`; `apps/desktop/src/api/providers.tsx`; `apps/desktop/src/main.tsx`; `apps/desktop/src/modules/settings/settings-page.tsx` (+ test).
- Docs: `docs/DATABASE.md` (publication, grants, migration), `docs/SECURITY.md` (anon revoke, Realtime grants), `docs/ARCHITECTURE.md` section 2 (built), `apps/desktop/CLAUDE.md` (drop "not built yet"), `docs/features/settings.md` (Live updates row), `.claude/skills/data-hooks/SKILL.md` (the pattern: register keys per table), `.claude/skills/db-change/SKILL.md` (new tables: add to `REALTIME_TABLES`, publication and `GRANT SELECT` in the same feature), `docs/CONTEXT.md` status.
- Not touched: `apps/server` (no server change at all), `tauri.conf.json` (CSP already fine).

## 7. Build plan (units and file ownership)
Contract first: `REALTIME_TABLES` and `RealtimeTable` in packages/shared (unit 1 writes it first; unit 2 imports it).
- **Unit 1, server-dev** (owns `packages/shared/src/realtime.ts`, `packages/shared/src/index.ts`, `packages/db/**`, `docs/DATABASE.md`, `docs/SECURITY.md`, `.claude/skills/db-change/SKILL.md`). Steps: shared constant + test; stand-in publication in testing.ts; custom migration (section 4); schema.test updates (failing first, then pass); "No schema changes" check. Check: `pnpm --filter @personal-os/db test` and `pnpm --filter @personal-os/shared test` pass.
- **Unit 2, ui-dev** (owns `apps/desktop/**`, `docs/ARCHITECTURE.md`, `docs/features/settings.md`, `.claude/skills/data-hooks/SKILL.md`). Steps: fake-realtime + failing sync tests; realtime-sync, store, registry, tasks keys; AuthState.userId; client wiring; Settings row; docs. Check: desktop tests, lint, typecheck, `pnpm build` for desktop.
- Orchestrator: merge, verify skill, reviewers (security-reviewer on the migration, grants and wiring; code-reviewer; docs-reviewer; design-reviewer on the Settings row), report with the migration file name for the owner.

## 8. Manual test plan for the owner
First run `pnpm db:migrate` (PowerShell, repo folder) and do the Supabase checks in section 4. Then `pnpm dev:server` and `pnpm dev:desktop`, sign in.
1. Settings, Account card: "Live updates" says "On" within a few seconds. Check dark and light mode.
2. Supabase dashboard, Table Editor, `tasks`: change the title of a task you can see in My tasks. Within about a second the app shows the new title without clicking anything.
3. Second window: open http://localhost:1420 in Chrome while the dev app runs (the same app in a browser; if the browser version does not start because of a Tauri-only part, say so and use step 2 instead). Sign in there. Add a task in one: it appears in the other. Complete it, add a tag, add a blocker, save a favorite, rename a tag: each shows in the other window.
4. Burst: merge a tag that is on many tasks (rename it to an existing name). Both windows settle on the same list; no flicker loop. Status may show "Reconnecting..." briefly and then "On".
5. Own edits: change a task's priority quickly several times in one window. It never jumps back to an old value.
6. Sleep: minimize the app (or put the PC to sleep) for 10+ minutes, change a task in the Supabase Table Editor meanwhile, restore the app. The change shows at once or after a few seconds; the status returns to "On".
7. Offline: turn Wi-Fi off: status turns "Reconnecting...". Turn it on: "On", and anything changed meanwhile appears.
8. Log out: status "Off" (after logging in again, "On").
Edge: delete a task in the Table Editor (a hard delete) while it is visible: it disappears.

## 9. Open points (for the owner)
1. Grants on your live tables: if your Supabase project was created after 30 May 2026, the tables may already lack grants; the migration fixes that either way. Please run the grants query in section 4 once after the migration.
2. Settings status row: keep it, or drop it for an even quieter app (D10)?
3. Second window for testing: the browser at localhost:1420 is the easiest; if you want two real Tauri windows, that is a separate feature (multi-window).

## 10. Suggested changes to earlier docs or decisions
1. **DATABASE.md, "The anon role has no access"**: today that is true only through RLS; this feature adds a real `REVOKE ... FROM anon` on the Realtime tables. Suggest doing the same for every table (entities too) and for new tables (db-change skill) so the statement is true at the privilege level.
2. **Writes from the app with the user's JWT**: authenticated may still have INSERT/UPDATE/DELETE grants on older tables, so a stolen token could write through PostgREST and skip the action registry (rule 1). Suggest a later migration that keeps only SELECT for authenticated (Realtime needs it) on every table. Not done here, to keep this feature small.
3. **db-change skill**: from 30 October 2026 every new table needs an explicit `GRANT SELECT ... TO authenticated` (for Realtime) and must be added to `REALTIME_TABLES` and the publication if a screen shows it.
4. **ARCHITECTURE.md** "Live updates (Step 2, not built yet)" and **apps/desktop/CLAUDE.md** "not built yet" become "built" with a pointer to `src/realtime/`.

## 11. Sources (opened by me)
- [S1] Supabase, Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
- [S2] Supabase, Realtime limits: https://supabase.com/docs/guides/realtime/limits
- [S3] Supabase, Postgres Changes troubleshooting: https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting
- [S4] Supabase, Subscribing to database changes: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- [S5] Supabase, Broadcast (from the database): https://supabase.com/docs/guides/realtime/broadcast
- [S6] Supabase, Handling silent disconnections in background apps: https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794
- [S7] supabase/walrus README (how Realtime applies RLS): https://github.com/supabase/walrus and https://github.com/supabase/walrus/blob/master/README.md
- [S8] Supabase changelog, tables not exposed to the Data API automatically: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- [S9] TkDodo, Using WebSockets with React Query: https://tkdodo.eu/blog/using-web-sockets-with-react-query
- [S10] TkDodo, Concurrent optimistic updates: https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
- [S11] TanStack Query, QueryClient reference: https://tanstack.com/query/latest/docs/reference/QueryClient
- [S12] TanStack Query, Query invalidation guide: https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- [S13] Tauri PR #12181, disable background throttling (Windows not implemented): https://github.com/tauri-apps/tauri/pull/12181
- [S14] Tauri 2 configuration reference (BackgroundThrottlingPolicy): https://v2.tauri.app/reference/config/
- Local code read: `node_modules/.pnpm/@supabase+supabase-js@2.117.2/.../dist/index.mjs` (`_handleTokenChanged`, realtime options); `@supabase+realtime-js@2.117.2/.../RealtimeClient.js` and `RealtimeChannel.js` (heartbeat, reconnect, `channel()` reuse, worker, subscribe statuses); `@tanstack+query-core@5.104.1/.../queryClient.js` (`invalidateQueries`, `cancelRefetch`).
- Local experiment: PGlite publication, guarded DO block, GRANT and REVOKE (section 2).
- Seen only in search summaries, not used for decisions: a PlayLoop PR on UPDATE delivery without FULL (page 404), eastondev.com blog posts, dev.to articles on the October grants change.
