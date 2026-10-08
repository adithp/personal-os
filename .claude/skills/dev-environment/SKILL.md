---
name: dev-environment
description: Facts and traps of this machine and setup: Windows with Git Bash and PowerShell, ports and Docker, Vite and .env, Cargo and Controlled Folder Access, Supabase connection, AWS and Oracle hosting, Git and worktrees. Use before running setup, server, Docker, database, deployment, or git commands, and whenever a command fails for a reason that smells like the environment.
---

# dev-environment

Read `pitfalls.md` here first; it holds the lessons. Facts that save retries:

## The machine
- Windows 11. Claude's Bash tool is **Git Bash** (use `/c/Users/...` or `C:/Users/...` paths with forward slashes; quote paths with spaces). The owner's own terminal is **PowerShell**: give the owner PowerShell or Notepad steps, not `sed`, `grep`, or heredocs.
- Git Bash rewrites a leading `/` argument into a Windows path; use `MSYS_NO_PATHCONV=1` for commands such as `docker` or `taskkill` that take `/flags`.
- Long here-documents with quotes can break in the Bash tool: write files with the Write tool or a small script instead.
- Repo: `C:\Users\adith\OneDrive\Documents\personal-os` (OneDrive is uninstalled; nothing syncs). Rust builds use the default target folder inside the project. Windows **Controlled Folder Access** blocks `cargo.exe` writing under Documents (it is switched off on this machine for Rust builds). Never change Windows security settings.

## Never
- Read, print, or edit `.env` files (deny rules enforce it). Check that variable names exist with a command that prints only present or missing; to set a value, give the owner the exact line to run themselves.
- Run `pnpm db:migrate` (the owner does). Apply nothing to the real database.
- Stop or touch another project's Docker container (the `ruview` container uses port 3000).
- Start the desktop app or Docker Desktop when memory is short (the harness kills background processes under memory pressure); ask first.

## Ports and processes
- Check a port first: `netstat -ano | grep ":3000 .*LISTEN"`. Server 3000, desktop dev (Vite) 1420, scratch Vite 1433.
- A dev server that must be stopped: find its `node.exe` by command line with PowerShell `Get-CimInstance Win32_Process` and stop only that process.
- **Vite reads `.env` only at startup:** restart `pnpm dev:desktop` after any change. `apps/desktop/.env` needs `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `apps/server/.env` needs `SUPABASE_URL` and `DATABASE_URL`.

## Supabase
- The **direct connection is IPv6 only**; use the **session pooler** URL for `DATABASE_URL` (the server refuses the direct one).
- New projects sign tokens with asymmetric keys: the server verifies against the project's **JWKS** (`jose`), there is no HS256 secret.
- Migrations are applied only by the owner (`pnpm db:migrate`); the server warns at startup when migrations are missing.

## Hosting
- Server: AWS EC2 ARM (Ubuntu 24.04) with Docker Compose + Caddy + DuckDNS (`adith-os.duckdns.org`); Oracle Always Free ARM in Mumbai has had no capacity. The compose file builds `linux/arm64`, which cannot run on this PC (no QEMU); only the build can be checked here.
- The AWS server's `apps/server/.env` is copied with `scp` (never printed); it needs `DATABASE_URL` for the current code.

## Git
- Branch per roadmap step (`step-2-tasks-notes`). Conventional Commits; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit `.env`. The owner pushes (`git push` is denied for Claude).
- The docs hook (`.githooks/commit-msg`) needs `core.hooksPath` set (`pnpm install` or `pnpm hooks:install`).
- Agent worktrees live in `.claude/worktrees/` (git-ignored); they branch from the current branch and only see committed work. Windows may refuse to delete their folders because of `node_modules`; delete them by hand later.
- Heavy tools (full `pnpm test`, `pnpm build`) are fine; Rust and Docker builds are the memory risks.
