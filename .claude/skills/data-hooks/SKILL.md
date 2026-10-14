---
name: data-hooks
description: How the desktop app gets and changes server data: the API client, TanStack Query hooks, cache keys, optimistic updates with rollback and the Undo toast, and later Realtime invalidation. Use when writing or changing hooks that call the backend. Loads automatically for query hook files.
paths:
  - apps/desktop/src/api/**
  - apps/desktop/src/modules/**/*queries*
---

# data-hooks

The app talks only to the backend REST API (never to Supabase tables). UI state lives in Zustand; server data lives in TanStack Query. Read `pitfalls.md` here first. Model code: `apps/desktop/src/modules/tasks/tasks-queries.ts` and `tags-queries.ts`.

## Pieces
- **API client** (`src/api/api-client.ts`): `createApiClient({ baseUrl, getToken })`. It adds `Authorization: Bearer <Supabase token>` (`auth.getAccessToken()`), turns errors into `ApiError(status, code, message)` using the server's `{error:{code,message}}`, and maps network failures to `ApiError(0, 'network', ...)`. `request` takes an optional `signal` (AbortSignal); an aborted request rethrows the AbortError, not an ApiError. Typing-driven queries (see `commands/search-queries.ts`) debounce, enable only from enough characters, and pass TanStack's `signal` so typed-over requests stop. `VITE_API_URL` is required (local `http://127.0.0.1:3000/api/v1`).
- **Providers** (`src/api/providers.tsx`): `AppProviders` gives `useApi()` (context in `api-context.ts`) and the `QueryClient` (`query-client.ts`: no retries for 4xx, 15 s stale time).
- **Shared types** come from `@personal-os/shared` (never redefine them in the app).

## Hook pattern
- **Keys:** one prefix per module (`TASKS_KEY = ['tasks']`), then `'list'` plus the filters, or `'detail'` plus the id. One `invalidateQueries({ queryKey: TASKS_KEY })` refreshes everything of the module. The palette search uses `SEARCH_KEY = ['search']`; mutations that change searchable data (tasks, tags) invalidate it too, and so must any module that joins search. Define the key constants in one file and import them (put a key in the file that owns the data, to avoid circular imports).
- **Queries:** `useQuery({ queryKey, queryFn: async () => (await api.request<{items: T[]}>('GET', '/things', { query })).items })`. Keep filters in the key so each combination is cached.
- **Mutations** (`useMutation`): `onMutate` cancels in-flight queries, patches every cached copy of the item with `setQueriesData`, and returns a **snapshot of only the cache entries that contain the item**; `onError` restores that snapshot and shows the server's message in a toast; `onSettled` invalidates the module key. Snapshotting every query would roll back unrelated later changes.
- **Undo:** write routes return `{ item, undo }`. For complete, delete, archive, and moves show a toast `Task deleted.` with an Undo button that posts the descriptor to `POST /undo`, then invalidates.
- **No hidden requests:** a hook that has no id yet passes `enabled: false`.

## Rules
- Errors shown to the user are `ApiError.message` (safe) or a generic sentence; never raw errors.
- Never put tokens or secrets in the app; only `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Optimistic patches must match what the server will return (status changes set `completedAt`).
- New query hooks come with tests against the mock API (`src/test/fake-api.ts`; extend it when the server gains routes).

## Later (not built yet)
Realtime: subscribe to Supabase Realtime on the user's rows and call `invalidateQueries` for the matching key on a change event (roadmap Step 2, "Realtime updates"). Add the pattern here when it is built.
