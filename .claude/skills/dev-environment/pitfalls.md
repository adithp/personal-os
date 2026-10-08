# Pitfalls: dev-environment

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10: Cargo cannot write in a folder protected by Windows Controlled Folder Access
- Symptom: cargo.exe failed to write build output under Documents ("Access is denied")
- Cause: Windows Controlled Folder Access protects Documents and blocked cargo.exe
- Fix: The owner switched Controlled Folder Access off for Rust builds; Claude never changes Windows security settings
- Prevention: documented, dev-environment pitfalls; decision 29

### 2026-10: Moving the repo to another folder failed (Move-Item, permissions on .git) and was reverted
- Symptom: Move-Item of the project failed on .git permissions
- Cause: The .git folder files were locked or protected during the move
- Fix: Do not move the repo; it stays at C:\Users\adith\OneDrive\Documents\personal-os (OneDrive is uninstalled)
- Prevention: documented, dev-environment pitfalls; decision 29

### 2026-10: Port 3000 was taken by another project's Docker container (ruview)
- Symptom: Docker or the server could not bind port 3000
- Cause: Another project's container used the port
- Fix: Check the port before testing; never stop or touch other projects' containers; use another port for scratch servers
- Prevention: documented, dev-environment pitfalls; the server fails loudly with EADDRINUSE

### 2026-10: .env files must never be read or edited by Claude
- Symptom: Reads and edits of .env files are blocked ("denied by a deny rule")
- Cause: Secrets must never enter the conversation
- Fix: Check only that variable names exist (prints present or missing); give the owner the line to run themselves
- Prevention: guarded, .claude/settings.json deny rules; scripts/repo-guards.test.mjs

### 2026-10: Bash commands like sed do not work in the owner's PowerShell
- Symptom: sed, grep, or heredoc commands pasted into PowerShell fail
- Cause: Claude's tool is Git Bash; the owner's terminal is PowerShell
- Fix: Give the owner PowerShell or Notepad steps
- Prevention: documented, dev-environment pitfalls

### 2026-10: Vite reads .env only at startup
- Symptom: A changed VITE_* value had no effect in the running app
- Cause: Vite loads .env once when it starts
- Fix: Restart pnpm dev:desktop after any .env change
- Prevention: documented, dev-environment pitfalls

### 2026-10: The Supabase direct connection is IPv6 only
- Symptom: DATABASE_URL with db.<ref>.supabase.co could not connect from IPv4 hosts
- Cause: The direct connection has no IPv4 address
- Fix: Use the session pooler URL; the server's env check rejects the direct host with that advice
- Prevention: guarded, apps/server/src/config/env.ts (refuses it) and its test

### 2026-10: New Supabase projects sign tokens with JWKS, not the old HS256 secret
- Symptom: Verifying tokens with a shared JWT secret does not work
- Cause: New projects use asymmetric signing keys
- Fix: Verify with jose against <SUPABASE_URL>/auth/v1/.well-known/jwks.json (issuer and audience checked)
- Prevention: guarded, apps/server/src/auth/verify-jwt.ts and its tests

### 2026-10-07: Oracle Always Free ARM has had no capacity in Mumbai
- Symptom: "Out of host capacity" when creating the A1.Flex instance
- Cause: Free ARM capacity in the region was exhausted
- Fix: The server runs on AWS for now; retry Oracle later; the same Docker setup moves between hosts
- Prevention: documented, dev-environment pitfalls; decision 35; docs/DEPLOYMENT.md

### 2026-10: TypeScript 7 is not supported by typescript-eslint yet
- Symptom: typescript-eslint peer dependency mismatch
- Cause: typescript-eslint supports TypeScript below 6.1 only
- Fix: Pin TypeScript 6.0.x exactly
- Prevention: guarded, scripts/repo-guards.test.mjs (typescript stays 6.0.x); decision 28

### 2026-10-09: Git worktrees branch from the default branch unless baseRef is "head", and only see committed work
- Symptom: Agents would start from the old main branch and miss uncommitted contract work
- Cause: The default worktree base is the default branch; uncommitted files are not in a worktree
- Fix: worktree.baseRef is "head"; the contract is committed before agents start
- Prevention: guarded, .claude/settings.json worktree.baseRef and scripts/repo-guards.test.mjs; orchestrate-feature

### 2026-10: Git Bash rewrites a leading / argument into a Windows path; long heredocs with quotes break
- Symptom: taskkill /PID ran as taskkill C:/Program Files/Git/PID; "unexpected EOF" from a heredoc
- Cause: MSYS path conversion; shell quoting in the tool
- Fix: Use MSYS_NO_PATHCONV=1 or double slashes; write files with the Write tool or a script file
- Prevention: documented, dev-environment pitfalls

### 2026-10-09: Windows cannot fully delete agent worktree folders (node_modules locks)
- Symptom: git worktree remove: "Directory not empty"
- Cause: Windows keeps node_modules files locked
- Fix: The branch is removed; delete the leftover folder by hand later (it is git-ignored)
- Prevention: documented, dev-environment pitfalls; orchestrate-feature

### 2026-10: Background dev processes are killed under memory pressure
- Symptom: The harness stopped pnpm dev:desktop; Docker Desktop was not running
- Cause: Low memory on the PC
- Fix: Do not restart heavy processes unasked; ask the owner first
- Prevention: documented, dev-environment pitfalls
