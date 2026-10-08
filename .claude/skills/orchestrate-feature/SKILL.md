---
name: orchestrate-feature
description: Build a feature with parallel agents: contract first, waves of at most 3 agents, file ownership, merge order, reviews, docs sync, then one report. Only runs when the owner types /orchestrate-feature <feature>.
disable-model-invocation: true
argument-hint: <feature name or roadmap item>
---

# orchestrate-feature: $ARGUMENTS

The main session is the orchestrator. It may run at most **3 subagents at once** (server-dev, ui-dev, and the reviewers). All use Sonnet and each works in its own git worktree (`.claude/settings.json` has `worktree.baseRef: "head"`, so worktrees branch from the current branch). Read `pitfalls.md` here first.

## 0. Read first
`docs/LESSONS.md` and the `pitfalls.md` files of the skills the feature touches; `docs/ROADMAP.md`, `docs/features/<module>.md`, and the plan/ownership doc if there is one (`docs/features/tasks-redesign.md` is the model). If anything is unclear or two documents disagree, stop and ask the owner (numbered questions). Never guess.

## 1. Contract commit (the orchestrator, sequential)
Write and COMMIT before any agent starts (worktrees only see committed work):
- Zod schemas and types in `packages/shared`, action names with permission levels, the route list and shapes;
- the database schema and its generated migration (db-change skill); migrations and drizzle meta are only ever touched by the orchestrator;
- React Query hook signatures (data-hooks skill), shared small components, pure logic with tests, the mock API (`fake-api.ts`) updated for the new routes;
- the page skeleton with empty slots (stub files with the final props and a comment saying who fills them), route files, `features.ts` flags;
- `docs/doc-map.json` entries if new areas appear; and the plan with the file ownership table in `docs/features/`.
Run the verify skill; commit. The contract commit hash is the base for the feature-wide docs check.

## 2. Waves of agents
- Split into independent units big enough to be worth it. Small changes and anything needing back-and-forth stay in the main session.
- **File ownership:** every agent gets the exact files or folders it owns; no two agents own the same file in a feature. Only the orchestrator touches migrations and drizzle meta, `packages/shared/src/index.ts`, route files and `routeTree.gen.ts`, `fake-api.ts`, `features.ts`, ROADMAP, DECISIONS, other docs, CLAUDE.md, skills. Check each upcoming feature for a file an agent must change but does not own (stub it in the contract instead).
- **Task message must include:** the files owned; the contract to read; what to build; the tests; the checks to run; "Follow the Coding principles in CLAUDE.md; read the pitfalls.md files of your skills first"; "If something is unclear, stop and report questions instead of guessing"; the commit rule: end every commit message with `[docs-ok] docs updated by orchestrator at merge`; and the report format (Branch, Files, Checks, Questions, Needed outside scope, **Lessons**, **Docs affected**).
- Start agents with `Agent` (`subagent_type: server-dev` or `ui-dev`, `isolation: worktree`, `model: sonnet`, `run_in_background: true`). Waves: wave 1 up to 3 builders; later waves for dependent units. New agent definitions load only after a session restart.

## 3. Merge (one branch at a time)
For each finished agent, in dependency order: read its report; record its **Lessons** (record-lesson skill); merge with `git merge --no-ff <branch>`; resolve conflicts yourself; collect its "Docs affected". Answer or collect its questions for the owner. After all merges: regenerate `routeTree.gen.ts` (`pnpm --filter @personal-os/desktop build` runs the router plugin), run the verify skill, fix failures. Remove merged worktrees (`git worktree remove --force`; folders with locked `node_modules` may need manual deletion on Windows) and branches.

## 4. Docs sync and reviews
1. Docs sync (docs-sync skill): update every mapped doc, DECISIONS.md rows, the feature doc.
2. **Feature-wide docs check** (agents' `[docs-ok]` tags are ignored here, so the feature as a whole cannot skip docs): `pnpm docs:check --range <contract commit>..HEAD --aggregate --ignore-docs-ok`. It must pass.
3. **Reviewer pass, in batches of at most 3** (never more than 3 agents at once). The reviewers only have Read, Grep, Glob: write the diff to `.claude/review/diff.patch` (`git diff <contract commit>..HEAD`, git-ignored) and tell them to read it, plus the file list. Delete the diff file after each review.
   - `code-reviewer` always.
   - `design-reviewer` when UI changed.
   - `security-reviewer` when server, database, auth, or config changed.
   - `docs-reviewer` always.
   Fix BLOCKER and SHOULD FIX findings (the reviews' notes go in the report's known issues). Re-run verify.

## 5. Report
Use the feature-report skill: models used per agent (from the task list), branches merged and conflicts, migrations to apply, **Docs updated**, **Lessons recorded**, manual test steps. Stop and wait for "next". Never start the next feature before it.
