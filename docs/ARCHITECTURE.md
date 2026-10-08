# Architecture

## 1. Overview
Three layers:
1. Apps (what I see): Tauri 2 desktop app now, Tauri 2 mobile app in Phase 2.
2. Backend (the brain): one Fastify server on an AWS EC2 ARM server (Oracle Cloud later) that runs all logic, the AI agent, Google sync, and reminders.
3. Services: Supabase (data, login, files, realtime, vector search), OmniRoute (AI gateway), Google APIs.

```
Desktop app ──HTTPS──► Caddy ──► Fastify backend ──► Supabase (Mumbai)
Mobile app  ──HTTPS──┘                │
                                      ├──► OmniRoute ──► AI providers
                                      └──► Google APIs (Gmail, Calendar, Drive)

Supabase Realtime ──change events──► Desktop and mobile apps
Laptop coding tools ──Tailscale──► OmniRoute
```

## 2. Data flow
- Login: apps sign in with Supabase Auth and send the session JWT to the backend on every request.
- Reads and writes: apps call the backend REST API only. The backend verifies the JWT, runs the action, and writes to Postgres.
- Live updates (Step 2, not built yet): apps subscribe to Supabase Realtime on their own rows. On a change event, TanStack Query refetches the affected data from the backend.
- AI: the backend calls OmniRoute; OmniRoute calls the configured AI provider.
- Google: the backend holds encrypted Google tokens and calls Google APIs. Apps never talk to Google directly.

## 3. Tech stack
Libraries not installed yet (planned): TipTap, CodeMirror, KaTeX, Shiki, Sigma.js, graphology, react-grid-layout, dnd-kit (Feature 2), rrule (Feature 3), Schedule-X, ECharts, TanStack Table, Vercel AI SDK, croner, googleapis.

| Area | Choice |
|---|---|
| Monorepo | pnpm workspaces |
| Desktop shell | Tauri 2 |
| Mobile (Phase 2) | Tauri 2 mobile |
| UI | React 19, TypeScript, Vite, Tailwind CSS, Tabler Icons |
| Routing | TanStack Router |
| State | Zustand (UI state), TanStack Query (server data) |
| Animation | Motion (formerly Framer Motion) |
| Note editor | TipTap, CodeMirror 6 (raw markdown), KaTeX, Shiki |
| Knowledge graph | Sigma.js + graphology |
| Dashboard grid | react-grid-layout |
| Desktop plugins | @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs (wallpaper upload, limited to $APPDATA/wallpapers) |
| Drag and drop | dnd-kit |
| Recurring dates | rrule (RRULE parsing and the next occurrence of a recurring task) |
| Calendar views | Schedule-X |
| Charts | Apache ECharts |
| Tables | TanStack Table |
| Command palette | cmdk |
| Auth | Supabase Auth, email and password (no sign-up in the app) |
| Backend | Node.js 22 LTS, TypeScript, Fastify |
| JWT verification | jose (Supabase JWKS) |
| Server build | tsup (bundles workspace packages for the Docker image) |
| ORM | Drizzle ORM |
| Validation | Zod |
| AI SDK | Vercel AI SDK with the OpenAI-compatible provider pointed at OmniRoute |
| Scheduler | croner (inside the backend; planned, not installed yet) |
| Google | googleapis (official Node client) |
| Database | Supabase Postgres with Row Level Security, full-text search, pgvector |
| Tests | Vitest, Testing Library, jsdom; PGlite (in-memory Postgres, tests only) |
| Lint and format | ESLint, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, Prettier, prettier-plugin-tailwindcss |
| UI gallery | Vite dev server in packages/ui (dev dependency only) |
| Hosting | AWS EC2 ARM VM for now (Oracle Cloud Always Free later), Docker Compose, Caddy, DuckDNS, Tailscale |

## 4. Folder structure
```
personal-os/
├── apps/
│   ├── desktop/          Tauri 2 + React app
│   │   ├── src-tauri/
│   │   └── src/
│   │       ├── api/      backend client + TanStack Query provider
│   │       ├── auth/     Supabase email and password login, session
│   │       ├── commands/ command palette + Ctrl shortcut registry
│   │       ├── dock/     bottom dock, magnification, auto-hide
│   │       ├── modules/  one folder per module (dashboard, settings, tasks built so far)
│   │       ├── routes/   TanStack Router file routes (routeTree.gen.ts is generated)
│   │       ├── shell/    title bar, background, app layout, toasts
│   │       ├── store/    Zustand stores (settings, palette, toasts, window effect)
│   │       └── test/     test setup and fakes
│   ├── server/           Fastify backend
│   │   └── src/
│   │       ├── routes/
│   │       ├── actions/      action registry + handlers
│   │       ├── auth/         JWT check (jose)
│   │       ├── config/       environment settings
│   │       ├── lib/          user-scope helper, database, schema check
│   │       ├── ai/           (planned) agent loop, skills, OmniRoute client
│   │       ├── integrations/ (planned) google (gmail, calendar, drive)
│   │       └── jobs/         (planned) scheduled jobs (croner)
│   └── mobile/           Phase 2
├── packages/
│   ├── shared/           Zod schemas, types, action definitions
│   ├── db/               Drizzle schema + migrations
│   └── ui/               design tokens + shared React components
├── scripts/              docs check, git hook install
├── .githooks/            commit-msg (docs check)
├── .github/workflows/    CI
├── infra/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── scripts/          backup, duckdns update
└── docs/
```

## 5. Scheduled jobs (backend)
| Job | Schedule |
|---|---|
| Reminders and due notifications | every minute |
| Recurring tasks, habits, transactions | daily 00:05 IST |
| Gmail sync (History API) | every 5 minutes |
| Calendar sync (sync tokens) | every 5 minutes |
| Drive changes sync | every 15 minutes |
| Subscription renewal alerts | daily 08:00 IST |
| Embedding updates for changed notes | every 10 minutes |
| Database backup | daily 02:00 IST (host cron with infra/scripts/backup.sh; script ready, not scheduled yet) |
