# Decisions log

| # | Decision | Reason |
|---|---|---|
| 1 | Desktop first, mobile in Phase 2 | Build and stabilize the core before adding devices |
| 2 | Tauri 2 for desktop and mobile | Small, secure, one framework for both |
| 3 | Cloud database (Supabase) from day one | Desktop and mobile share data with no custom sync |
| 4 | Supabase free plan, Mumbai | Free, includes Postgres, auth, storage, realtime, pgvector; close to Kerala |
| 5 | Own backend server (not app-only) | Secrets stay safe, reminders run when devices are off, AI and Google shared by all devices |
| 6 | Node.js + TypeScript + Fastify | One language across the whole project, shared types with the apps |
| 7 | Oracle Cloud Always Free | Only option that stays free long term; AWS closes after 6 months, Azure credit lasts 30 days |
| 8 | OmniRoute as the AI gateway | One API for many providers, automatic fallback, free self-hosted |
| 9 | One OmniRoute for the assistant and coding tools | Separate keys and limits per use |
| 10 | Tailscale for coding tools access | OmniRoute never exposed to the internet |
| 11 | DuckDNS free subdomain | Free HTTPS domain for the server |
| 12 | Internal action system, not MCP | Full control of tools, permissions, and security |
| 13 | Online-first with cache, no full offline | Simpler; offline can be added later |
| 14 | Dark glass + light mode, pastel tiles, bottom dock with magnification | Chosen design from our discussion |
| 15 | Dock auto-hide, magnification, wallpaper configurable in Settings | Personal preference can change |
| 16 | AI providers start free and are configurable in Settings | Change models without code changes |
| 17 | Schedule-X for calendar views | Chosen for its modern look |
| 18 | Single user | Personal assistant for me only |
| 19 | Motion (formerly Framer Motion) 14 for animation | Same library under its new package name |
| 20 | Email and password login, no sign-up in the app | Works fully inside Tauri; my one account is created in the Supabase dashboard and public sign-ups are disabled |
| 21 | JWT verification with Supabase JWKS using jose | New Supabase projects use asymmetric signing keys; no shared JWT secret on the server |
| 22 | Backend scopes every query by user_id with one shared helper; RLS stays ON | The backend connects as postgres (bypasses RLS); RLS still protects client and Realtime access; isolation is proven by tests |
| 23 | Settings saved locally (Zustand persist) until Step 3 | The action registry and settings API arrive in Step 3 |
| 24 | Supabase session pooler (IPv4) for DATABASE_URL | The direct connection is IPv6-only and the Oracle VM uses IPv4 |
| 25 | Backups with pg_dump in a matching postgres container and rclone to Oracle Object Storage (S3-compatible API) | No host Postgres or OCI CLI needed; pg_dump version matches Supabase |
| 26 | Frameless window with a custom glass title bar | Matches the glass design in dark and light mode |
| 27 | Gradient placeholder wallpapers | Real images will be added later |
| 28 | TypeScript 6.0.3, not 7 | typescript-eslint supports TypeScript below 6.1 only |
| 29 | Repo stays in OneDrive; CARGO_TARGET_DIR outside it (C:\dev\cargo-target) | Keep the current location; avoid syncing Rust build output; move the repo if OneDrive causes real errors |
| 30 | prettier-plugin-tailwindcss, Vite UI gallery in packages/ui, tsup server build, PGlite for tests | Approved tooling for Step 1 |
