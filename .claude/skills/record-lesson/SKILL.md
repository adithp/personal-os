---
name: record-lesson
description: Record a lesson right after fixing any error so it never happens twice: a failed test from a wrong assumption, a surprising build, type, lint or runtime error, a command that failed on this Windows machine, a permission block, a fix the owner asked for after checking a feature, or wrong library or API use. Use after the fix, before moving on.
---

# record-lesson

Lessons live in the repository (not in Claude's auto memory, which is only on one machine and not in git). Before starting any feature, read `docs/LESSONS.md` and the `pitfalls.md` of the skills you will use.

## When
Every time something cost a retry or a fix:
- a test failed because of a wrong assumption;
- a build, type, lint, or runtime error with a non-obvious cause;
- a command failed because of this environment (Windows, Git Bash vs PowerShell, ports, permissions);
- a permission or deny-rule block;
- a fix the owner asked for after checking a feature;
- wrong library or API use.
Skip typos and trivial one-line slips.

## What to write (short)
```
### <date> <area>: <one-line summary>
- Symptom: <the exact error text, trimmed>
- Cause: <the real root cause>
- Fix: <what changed>
- Prevention: <ladder level and where it lives> (guarded | documented)
```

## The prevention ladder (strongest first; record which one you used)
1. **Automated guard:** a test, a lint rule, a type, a check script, or a hook that makes the mistake impossible or fails loudly (examples: the env check that refuses the Supabase direct URL; `.prettierignore` for drizzle meta; `scripts/repo-guards.test.mjs`; the startup migration check). Mark the lesson **guarded**.
2. **An instruction** in the relevant skill's `pitfalls.md` (or its SKILL.md). Mark it **documented**.
3. **A line in CLAUDE.md "Known pitfalls"**, only for cross-cutting critical rules (keep that section to about 15 lines).
Always try 1 first. If you can only do 2 or 3, say why 1 is not practical.

## Where to put it
1. Add one line to `docs/LESSONS.md` (the index): `date | area | summary | guarded or documented | where the prevention lives`.
2. Add the full entry to the `pitfalls.md` of the matching skill (`.claude/skills/<skill>/pitfalls.md`): verify, new-action, api-route, db-change, ui-design-system, data-hooks, time-and-money, testing-patterns, dev-environment, orchestrate-feature, docs-sync. Use `dev-environment` for anything about this machine, Git, Docker, ports, Supabase connection, hosting.
3. Add the guard itself (test, lint rule, script) in the same commit.

## Who writes lessons
- The main session records a lesson right after fixing the problem, before moving on.
- Subagents cannot edit docs or skills. They put a **Lessons** section in their final report (symptom, cause, fix, suggested prevention). The orchestrator records those when merging.

## Rules
- One lesson per mistake; update an existing entry instead of duplicating it.
- Keep entries short and factual; paste only the error line that identifies the problem; never paste secrets, tokens, or connection strings.
- Mention new lessons in the feature report ("Lessons recorded").
