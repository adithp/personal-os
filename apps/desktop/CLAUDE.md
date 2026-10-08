# Desktop app rules

- Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS.
- Follow docs/DESIGN.md exactly. Use components and tokens from packages/ui only.
- Every screen must work in dark and light mode.
- App navigation is the bottom dock only. No app-level sidebar. The Tasks module has its own slim inner side panel (docs/features/tasks-redesign.md).
- Server data through TanStack Query hooks calling the backend API; UI state in Zustand.
- Subscribe to Supabase Realtime and invalidate the matching queries on change (not built yet: ROADMAP Step 2 "Realtime updates"; until then mutations invalidate their own queries).
- Never store secrets. Only VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- One folder per module in src/modules (dashboard, settings, tasks exist; the others are placeholders). Shared app code lives in api/, auth/, commands/, dock/, shell/, store/ and routes/ (TanStack Router file routes; routeTree.gen.ts is generated).
