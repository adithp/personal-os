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
- docs/LESSONS.md – mistakes we already made (also read the pitfalls.md of the skills you will use)

## Coding principles
For trivial changes (typos, one-liners), use judgment instead of the full process.
1. **Think before coding.** State your assumptions. When something has more than one reading, show the options instead of picking silently. Say so when a simpler approach exists. When confused, stop and ask (this is the rule "ask me, never guess" below).
2. **Simplicity first.** Write the minimum code that solves the request. No speculative features, no abstractions for one use, no configurability nobody asked for, no error handling for cases that cannot happen. If 200 lines could be 50, rewrite it.
3. **Surgical changes.** Touch only what the task needs. Do not reformat, refactor, or "improve" nearby code, comments, or style. Remove only what your own change made unused; mention other dead code instead of deleting it. Every changed line must trace back to the request.
4. **Goal-driven execution.** Turn each task into checks before coding (for example "write a failing test, then make it pass"). For multi-step work, state a short plan with a check per step, and loop until the checks pass.

(Based on the ideas in github.com/multica-ai/andrej-karpathy-skills, MIT license, written in our own words.)

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
- pnpm install – install everything (also turns on the git hooks)
- pnpm dev:desktop – run the desktop app
- pnpm dev:server – run the backend
- pnpm test – run all tests (Vitest)
- pnpm lint – ESLint + Prettier check
- pnpm typecheck – TypeScript checks
- pnpm docs:check – checks that code changes come with their docs
- pnpm db:generate / pnpm db:migrate – Drizzle migrations (I run db:migrate, never Claude)

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

## Skills (use them instead of guessing the procedure)
- Before every commit and before a feature report: **verify** (lint, typecheck, test, docs check, build).
- New action: **new-action**. New route: **api-route**. Schema change or migration: **db-change**.
- Screens and components: **ui-design-system**. Server data in the app: **data-hooks**.
- Dates, recurrence, money: **time-and-money**. Writing tests: **testing-patterns**.
- After any code change: **docs-sync** (docs must match the code). After any fix that cost a retry: **record-lesson**.
- Machine, ports, Docker, Supabase, hosting, git: **dev-environment**. Finished feature: **feature-report**.
- A feature with parallel agents: **/orchestrate-feature <feature>** (only I start it).

## Known pitfalls (the full list is docs/LESSONS.md)
- Never read, print, or edit .env files (deny rules enforce it). Never paste secrets, tokens, or connection strings anywhere.
- Never run pnpm db:migrate. After a schema change tell me which new migration files to apply and what to check in Supabase (the app shows "Database update needed: run pnpm db:migrate" until then).
- Check port 3000 before starting a server or Docker; never touch another project's container.
- Your Bash tool is Git Bash; my terminal is PowerShell (give me PowerShell or Notepad steps). Write files with the Write tool, not long heredocs.
- Dates: UTC stored, India calendar days for "today" and "overdue"; rrule needs the floating-UTC conversion (time-and-money).
- Supabase: session pooler URL (not the IPv6-only direct one); tokens are verified with JWKS.
- Vite reads .env only at startup: restart pnpm dev:desktop after changes.
- Agent worktrees only see committed work and branch from my current branch; agent definitions load only when a session starts.
- A commit that changes mapped code (docs/doc-map.json) is blocked unless its docs changed or the message has `[docs-ok] <reason>`.
- Do not restart heavy processes (dev app, Docker Desktop) on your own when memory is short.

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
When a feature is finished, give me a feature report (the **feature-report** skill has the format) with:
1. What was built (short list).
2. Files created or changed.
3. Automated checks you ran and their results: pnpm lint, pnpm test, and the build. All must pass. If something fails, fix it before reporting.
4. Manual test steps for me: exact steps to run the app and what I should see at each step, including dark mode, light mode, and edge cases.
5. Anything not done or known issues.
Then write: "Feature complete. Waiting for your check. Reply 'next' to continue or tell me what to fix."

### After my check
- If I report a problem, fix only that problem, run the checks again, and send a new feature report.
- Only after I reply "next": tick the item in docs/ROADMAP.md and suggest a commit message.

## Parallel work
The main session is the orchestrator and may run at most 3 subagents at once (server-dev, ui-dev, and the reviewers code-reviewer, design-reviewer, security-reviewer, docs-reviewer). All use Sonnet and each works in its own git worktree. Only I start a parallel feature, with /orchestrate-feature <feature>; the procedure (contract first, file ownership, merge, reviews) lives in that skill. Agents cannot ask me anything: they stop and report questions, and the orchestrator asks me.
