# Desktop app rules

- Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS.
- Follow docs/DESIGN.md exactly. Use components and tokens from packages/ui only.
- Every screen must work in dark and light mode.
- Navigation is the bottom dock only. No sidebar.
- Server data through TanStack Query hooks calling the backend API; UI state in Zustand.
- Subscribe to Supabase Realtime and invalidate the matching queries on change.
- Never store secrets. Only VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- One folder per module in src/modules.
