# Personal OS

My personal operating system: one desktop app for tasks, habits, notes, knowledge graph, calendar, Gmail, Drive, finance, subscriptions, wallet, and projects, with a built-in AI assistant.

## Requirements
- Node.js 22 LTS
- pnpm
- Rust toolchain (for Tauri 2)
- A Supabase project (free plan, Mumbai region)
- The deployed server (AWS now, see docs/DEPLOYMENT.md); optional while developing, because development uses the local server
- Tailscale (needed from Step 3, for the coding tools)

## Setup
1. Clone the repo.
2. Copy the matching section of .env.example into apps/server/.env and apps/desktop/.env. The desktop needs VITE_API_URL, VITE_SUPABASE_URL, and VITE_SUPABASE_ANON_KEY; the server needs SUPABASE_URL and DATABASE_URL. The rest is for later steps.
3. Run pnpm install.
4. Run pnpm db:migrate.
5. Start the backend: pnpm dev:server
6. Start the desktop app: pnpm dev:desktop

## Documentation
All project documents are in /docs. Start with docs/PRD.md and docs/ROADMAP.md.
