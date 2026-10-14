---
name: verify
description: Run the project quality gate (lint, typecheck, test, docs check, build) and report pass or fail per step. Use at the end of a batch (after all lanes are merged), before any report, and when the owner asks. Do not run it on every commit or after every merge (decision 68); lint is fixed once at the end, not while building. Web-only: never runs the Tauri or Rust build or pnpm db:migrate.
allowed-tools: Bash(pnpm lint), Bash(pnpm typecheck), Bash(pnpm test), Bash(pnpm test:*), Bash(pnpm docs:check), Bash(pnpm docs:check:*), Bash(pnpm build), Bash(git status), Bash(git diff:*)
---

# verify: the quality gate

Run these in order, from the repository root. Stop at the first failing step, fix it, then run the whole list again (a fix can break an earlier step).

1. `pnpm lint` (ESLint with zero warnings, then Prettier check)
2. `pnpm typecheck` (root tsc plus every package)
3. `pnpm test` (all Vitest projects)
4. `pnpm docs:check` (staged changes need their docs; see the docs-sync skill)
5. `pnpm build` (typecheck plus the desktop Vite build and the server tsup bundle; about 10 seconds)

Report one line per step: `lint: pass`, `typecheck: fail (3 errors)`, and so on. If a step fails, show the first errors with file and line, never the whole log.

## Never run here
- `pnpm build:desktop`, `tauri build`, `cargo` (slow, and the Rust target folder may be locked on this machine).
- `pnpm db:migrate` (the owner applies migrations; it is denied for Claude).
- Anything that starts a server on port 3000 without checking the port first.

## When something fails
- Fix the cause, not the check (no `eslint-disable`, no skipped test) unless the rule is wrong for this case, and say why in a comment.
- If the failure was surprising or cost a retry, run the record-lesson skill before moving on.
- A full `pnpm test` run can fail on PGlite hook timeouts when the machine is loaded: run the failing project alone (`pnpm exec vitest run --project server`) before deciding it is a real failure, and note it if it only fails under load.

## Quick subsets while working
- One project: `pnpm exec vitest run --project desktop` (also `server`, `db`, `shared`, `ui`, `infra`, `scripts`).
- One file: `pnpm exec vitest run --project desktop src/modules/tasks/sections.test.ts`.
- Lint one folder: `pnpm exec eslint apps/server/src --max-warnings 0`.

Read `pitfalls.md` in this folder for lessons about running the checks.
