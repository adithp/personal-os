# Personal OS

Personal OS is my single-user personal assistant desktop app: tasks, habits, Obsidian-style notes with a knowledge graph, calendar, Gmail, Google Drive, finance, wallet, subscriptions, and projects, with an AI assistant that can read and act across all of them.

Read these before starting any work:
- docs/PRD.md – what we are building and why
- docs/ROADMAP.md – what to build next (always work on the current step only)
- docs/ARCHITECTURE.md – how the parts connect and the folder structure
- docs/DESIGN.md – the visual design system (follow it exactly)
- docs/DATABASE.md – tables and security rules
- docs/AI_SYSTEM.md – actions, permissions, skills, OmniRoute
- docs/features/<module>.md – details for the module being built

## Tech stack (fixed, do not change without asking)
- Monorepo: pnpm workspaces
- Desktop: Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS
- Mobile (Phase 2): Tauri 2 mobile
- Backend: Node.js 22 LTS + TypeScript + Fastify
- Database: Supabase (Postgres, Auth, Storage, Realtime, pgvector), region Mumbai
- ORM: Drizzle ORM
- AI: OmniRoute gateway, called with the Vercel AI SDK (OpenAI-compatible provider)
- Validation and shared types: Zod in packages/shared
- Hosting: AWS EC2 ARM server for now (free-plan credits), moving to Oracle Cloud Always Free when capacity allows; Docker Compose, Caddy, DuckDNS, Tailscale (decision 35)

## Commands
- pnpm install – install everything
- pnpm dev:desktop – run the desktop app
- pnpm dev:server – run the backend
- pnpm test – run all tests (Vitest)
- pnpm lint – ESLint + Prettier check
- pnpm db:generate / pnpm db:migrate – Drizzle migrations

## Rules
1. Every data change goes through the action registry (docs/AI_SYSTEM.md). UI buttons and the AI call the same actions.
2. Never put secrets in the desktop or mobile app. Only the Supabase anon key and API URL are allowed there.
3. Every table has user_id and Row Level Security turned on.
4. Money is stored as integer paise (INR). Never use floats for money.
5. Store dates in UTC; display in Asia/Kolkata.
6. Follow docs/DESIGN.md for every screen: module colors, tiles, glass panels, dark and light mode.
7. Shared types and Zod schemas live in packages/shared. Never redefine them in an app.
8. Write tests for every action and API endpoint.
9. Do not add new libraries without asking.
10. When something in the docs is unclear, ask before building.


## Working rules (always follow, in every mode, including auto-accept mode)

### One feature at a time
- Build only ONE feature (one lettered part or one roadmap item) at a time.
- Never start the next feature on your own. After finishing a feature, STOP and wait.
- Only start the next feature when I clearly write "next" or "start <feature name>".
- Never build parts of future features "to save time", even if it seems easy.

### Doubts must be asked
- If anything is unclear, missing, or contradicts the docs, STOP and ask me before writing code.
- This applies in auto-accept mode too. Auto mode only means you may edit files without asking permission; it never means you may guess.
- Never choose between two options on your own. Show the options and wait for my answer.
- Ask all your questions together, numbered, then wait.

### Every feature must be verified before it is called done
When a feature is finished, give me a feature report with:
1. What was built (short list).
2. Files created or changed.
3. Automated checks you ran and their results: pnpm lint, pnpm test, and the build. All must pass. If something fails, fix it before reporting.
4. Manual test steps for me: exact steps to run the app and what I should see at each step, including dark mode, light mode, and edge cases.
5. Anything not done or known issues.
Then write: "Feature complete. Waiting for your check. Reply 'next' to continue or tell me what to fix."

### After my check
- If I report a problem, fix only that problem, run the checks again, and send a new feature report.
- Only after I reply "next": tick the item in docs/ROADMAP.md and suggest a commit message.