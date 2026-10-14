# Desktop app rules

- Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS.
- Follow docs/DESIGN.md exactly. Use components and tokens from packages/ui only.
- Every screen must work in dark and light mode.
- App navigation is the bottom dock only. No app-level sidebar. The Tasks module has its own slim inner side panel (docs/features/tasks-redesign.md).
- Server data through TanStack Query hooks calling the backend API; UI state in Zustand.
- Live updates: src/realtime/ subscribes to Supabase Realtime and invalidates the matching queries on change. A module that shows data from a table in REALTIME_TABLES adds its query keys in its own realtime-keys.ts and registers it in realtime/registry.ts. Mutations still invalidate their own queries.
- Never store secrets. Only VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- One folder per module in src/modules (dashboard, settings, tasks exist; the others are placeholders). Shared app code lives in api/, auth/, commands/, dock/, realtime/, shell/, store/ and routes/ (TanStack Router file routes; routeTree.gen.ts is generated).
