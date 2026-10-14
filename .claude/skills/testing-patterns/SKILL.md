---
name: testing-patterns
description: How tests are written here (Vitest): PGlite database tests with the Supabase auth stub, route tests with JWT keys, UI tests against a mock API with Testing Library, fake timers, mocked Tauri modules, and keyboard tests. Use when writing or fixing any test.
---

# testing-patterns

`pnpm test` runs every Vitest project (shared, db, ui, server, desktop, infra, scripts). Read `pitfalls.md` here first. Rule: every action and route has tests (CLAUDE.md rule 8, docs/CONVENTIONS.md).

## Database and server tests (PGlite, no real database)
- `createTestDb()` from `@personal-os/db/testing` starts an in-memory Postgres, installs a stand-in for Supabase (`auth.users`, `auth.uid()`, the `anon` and `authenticated` roles), and applies the real migrations. `createTestUser(db, id)` adds a user. `asRole(db, userId | null, fn)` runs as the authenticated or anonymous role to prove RLS.
- Clear tables in `beforeEach` with `truncate table entity_tags, tags, links, tasks, entities, auth.users cascade` (add new tables to the list).
- The backend skips RLS, so server tests build a `UserScope` (`createUserScope(t.db, USER_ID)`) and prove isolation with two users (`USER_ID`, `OTHER_USER_ID` from `src/test/jwt.ts`).
- Action tests call `registry.run(ctx, 'tasks.create', input)`; check success, `ZodError` for bad input, 404 for another user's row, confirmation for destructive actions, and the undo.
- Route tests: `buildApp({ env, verifier: keys.verifier, db })`, `app.inject(...)`, tokens from `createTestKeys()` (`keys.sign({ sub })`, `signWithUnknownKey`, `expiresIn: -60`).
- PGlite files start slowly under load: `hookTimeout` is 60 s in the server and db vitest configs. Do not lower it.

## Desktop UI tests (jsdom + Testing Library)
- Render the whole app with `renderApp(path, auth, api)` (`src/test/render-app.tsx`): real routes, a fresh `QueryClient` with no retries. `signedInAuth()` and `signedOutAuth()` are fakes in `src/test/fake-auth.ts`.
- **Mock API:** `createFakeApi(tasks, tags, favorites, goals, notes, folders)` (positional, all optional; notes data and routes live in `src/test/fake-notes.ts`, with `makeNote` and `makeFolder`) (`src/test/fake-api.ts`) implements the real routes' rules in memory (soft delete, archive, subtasks, tags, filters, undo). Read `fake.calls` to see what was sent, `fake.tasks()` for state, `fake.failNext(status, code, message)` for errors, `fake.slow(ms)` to look before the answer. When the server gains a route or rule, extend the fake in the same change. `makeTask`, `makeTag` build data.
- Standard `beforeEach`: `localStorage.clear()`, reset the settings and UI stores, stub `matchMedia`; mock the Tauri window module: `vi.mock('@tauri-apps/api/window', async (importOriginal) => ({ ...(await importOriginal()), getCurrentWindow: vi.fn() }))`. (Tauri's own `mockIPC` is not used.)
- `src/test/setup.ts` polyfills what jsdom lacks (`scrollTo`, `scrollIntoView`, `ResizeObserver`); canvas is stubbed where the glass engine is tested.
- **Fake timers:** `vi.useFakeTimers({ shouldAdvanceTime: true })` with `userEvent.setup({ advanceTimers: (ms) => { vi.advanceTimersByTime(ms); } })`; always `vi.useRealTimers()` in `afterEach`. For "today" use `vi.setSystemTime(new Date('2025-10-07T06:30:00.000Z'))` (12:00 in India).
- **Realtime:** `createFakeRealtime()` (`src/test/fake-realtime.ts`) replaces the Supabase channel API: `emit(table)` sends a change event, `setStatus('SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED')` reports the subscribe status, `channels` shows the bindings. Use fake timers (events are batched for 300 ms), reset `useRealtimeStore` in `beforeEach`, and use `FAKE_USER_ID` from `fake-auth.ts` for the `user_id=eq.<id>` filter. `renderApp` has no realtime sync.
- **Keyboard tests:** `userEvent.keyboard('{Enter}')`, `{Escape}`, `' '` for Space, `{Delete}`; assert focus with `toHaveFocus()`; test that shortcuts do nothing inside inputs, with a modifier, and while a menu or the palette is open.
- Dates in boxes: `fireEvent.change(box, { target: { value: '2025-10-07T17:00' } })` then `fireEvent.blur`. Range inputs: `fireEvent.change` (jsdom ignores keyboard stepping).
- Query by role and name (`getByRole('checkbox', { name: 'Complete: Buy milk' })`); avoid text queries that also match the side panel.
- Dark and light: set the theme in the settings store and check no hard-coded colors (`html` has no `#rrggbb`).

## Other projects
- `infra` tests read config files (Dockerfile, compose, CI workflow) without Docker. `scripts` tests cover `docs-check.mjs` and the repo guards. Put `// @vitest-environment node` on tests that read files.
- Name tests as sentences about behavior; avoid testing implementation details.
