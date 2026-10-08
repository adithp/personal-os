---
name: docs-sync
description: Keep the docs in step with the code after a change: find the docs mapped to the changed files in docs/doc-map.json, update every statement that no longer matches, and run pnpm docs:check. Use after any code change under apps, packages, infra, or workflows, and before committing.
---

# docs-sync

The docs describe behavior; the code is the truth. After a code change, make the docs say what the code does now. Read `pitfalls.md` here first.

## Procedure
1. **Find the docs:** `pnpm docs:check` lists the changed code and the docs to review. The map is `docs/doc-map.json` (routes → API.md; schema and migrations → DATABASE.md; actions → AI_SYSTEM.md; packages/ui and the desktop shell → DESIGN.md; modules → `docs/features/<module>.md` (and `<module>-*.md`); infra, Dockerfiles, `.env.example`, workflows, hooks → DEPLOYMENT.md or SECURITY.md; dependency changes → ARCHITECTURE.md; `tauri.conf.json` → SECURITY.md or DEPLOYMENT.md).
2. **Open each mapped doc and read the sections about what you changed.** Update every statement that is now false, missing, or misleading: tables, lists of routes or actions, field names, defaults, limits, error codes, screens, shortcuts, setup steps.
3. **Keep the doc's own style** (headings, tables, tone, sentence case, short sentences). Do not reformat or reorganize parts you did not need to change.
4. **Never invent behavior.** Only write what the code does (check the code, or run it). If the code and a decision disagree, ask the owner; do not pick.
5. **Also update** `docs/decisions/DECISIONS.md` when a decision changed (new numbered row), and the module's `docs/features/<module>.md` "Done when" / rules. Tick `docs/ROADMAP.md` items only after the owner says "next" (it is not part of this check).
6. **Run `pnpm docs:check`** (staged files). It must say `docs-check: ok`.
7. **Bypass** only when a change has no behavior impact (formatting, a rename with no effect, test-only tooling): add a line `[docs-ok] <reason>` to the commit message. A reason is required. Agent branches use `[docs-ok] docs updated by orchestrator at merge`; the orchestrator then runs the feature-wide check (see orchestrate-feature), which ignores those tags.

## Enforcement (so it cannot be forgotten)
- `.githooks/commit-msg` runs the check on every commit (turned on by `pnpm install` through the `prepare` script, or `pnpm hooks:install`).
- The verify skill runs `pnpm docs:check`.
- CI runs it over the pushed commits (respecting `[docs-ok]` per commit).
- The `docs-reviewer` agent compares a merged diff with the mapped docs before a feature report.

## In a feature report
List each doc changed under "Docs updated", and each `[docs-ok]` bypass with its reason.
