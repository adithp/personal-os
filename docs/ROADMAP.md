# Roadmap

Work on one step at a time. Use each step daily before starting the next.

## Step 1 – Foundation

### Features (code)
- [x] a. Monorepo setup (pnpm workspaces, strict TypeScript, ESLint, Prettier, Vitest)
- [x] b. packages/ui design tokens and components (dark and light), UI gallery
- [x] c. Desktop shell: custom glass title bar, dock, wallpaper, theme switching, placeholder module pages
- [x] c2. Supabase email and password login screen and session
- [ ] d. Settings screen (appearance incl. Background: Transparent / Wallpaper / Solid, dock, logout), saved locally
- [ ] e. Dashboard with static placeholder data
- [ ] f. Command palette (commands only) and keyboard shortcuts
- [ ] g. Fastify skeleton with JWKS JWT verification and /api/v1/health
- [ ] h. Drizzle schema for entities and links with RLS, user-scope helper, migrations generated but not applied
- [ ] i. Infra: docker-compose (caddy, server), Caddyfile, server Dockerfile, backup script, DuckDNS script

### Manual setup (me)
- [ ] Oracle account and server
- [ ] Tailscale
- [ ] DuckDNS
- [ ] Supabase project and account
- [ ] Google Cloud project

## Step 2 – Tasks and notes
- [ ] Tasks: CRUD, subtasks, priorities, deadlines, tags, recurring, dependencies
- [ ] Task views: list and kanban
- [ ] Notes: TipTap editor, folders, wikilinks, backlinks, tags, templates, daily notes, version history
- [ ] Full-text search
- [ ] Realtime updates

## Step 3 – AI core
- [ ] OmniRoute container, assistant and coding keys, Tailscale access for coding tools
- [ ] Model routes: fast, smart, embed, coding
- [ ] Action registry with permission levels, logging, undo, confirmation
- [ ] /ai/chat with streaming and the agent loop
- [ ] Assistant card and full chat panel
- [ ] Skills: Daily planner, Knowledge assistant
- [ ] Settings → AI (OmniRoute dashboard, model routes)
- [ ] Move appearance, background, and dock settings from local Zustand persist (Step 1) to the server settings table through the action registry
- [ ] Done when: the AI creates a task from a chat message

## Step 4 – Google
- [ ] Google OAuth on the server, encrypted tokens, reconnect banner
- [ ] Calendar sync and Schedule-X views
- [ ] Gmail: read, search, draft
- [ ] Gmail: send, reply, forward, archive, labels
- [ ] Drive: browse, search, upload, download, preview
- [ ] Skills: Email assistant, Calendar assistant

## Step 5 – Projects and habits
- [ ] Projects hub with linked items, milestones, kanban, timeline, clients, time tracking
- [ ] Habits with streaks, calendar view, statistics, reminders
- [ ] Skills: Project manager, Freelance assistant, Habit coach

## Step 6 – Money
- [ ] Wallets, transactions, categories, recurring transactions
- [ ] Budgets, savings goals, monthly reports
- [ ] Subscriptions with renewal alerts
- [ ] Statement import (CSV) with AI categorization
- [ ] Skills: Finance assistant, Subscription assistant

## Step 7 – Polish
- [ ] Customizable dashboards (Work and Personal defaults)
- [ ] Knowledge graph with Sigma.js
- [ ] Semantic search with embeddings
- [ ] Cross-app AI workflows (client email example works end to end)
- [ ] Skills Manager screen
- [ ] Skills: Research assistant, Coding assistant

## Step 8 – Phase 2 mobile
- [ ] Tauri 2 mobile app with bottom tab bar
- [ ] Push notifications
- [ ] All Phase 1 modules on mobile
