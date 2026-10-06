# Personal OS

My personal operating system: one desktop app for tasks, habits, notes, knowledge graph, calendar, Gmail, Drive, finance, subscriptions, wallet, and projects, with a built-in AI assistant.

## Requirements
- Node.js 22 LTS
- pnpm
- Rust toolchain (for Tauri 2)
- A Supabase project (free plan, Mumbai region)
- The Oracle Cloud server running OmniRoute and the backend (see docs/DEPLOYMENT.md)
- Tailscale installed on this computer

## Setup
1. Clone the repo.
2. Copy .env.example to .env in apps/server and apps/desktop and fill in the values.
3. Run pnpm install.
4. Run pnpm db:migrate.
5. Start the backend: pnpm dev:server
6. Start the desktop app: pnpm dev:desktop

## Documentation
All project documents are in /docs. Start with docs/PRD.md and docs/ROADMAP.md.
