# Pitfalls: orchestrate-feature

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10-09: New agent definitions load only after a session restart
- Symptom: Agent type 'server-dev' not found
- Cause: Agent files are read when the session starts
- Fix: Restart Claude Code after adding or changing .claude/agents
- Prevention: documented, orchestrate-feature pitfalls

### 2026-10-09: Agents cannot edit docs, but the docs hook runs on their commits
- Symptom: Agent commits would fail docs-check
- Cause: Agents are not allowed to touch docs; the hook applies to every commit
- Fix: Agents end commit messages with "[docs-ok] docs updated by orchestrator at merge"; the orchestrator runs the feature-wide check ignoring those tags
- Prevention: documented, orchestrate-feature; agent files

### 2026-10-09: Reviewer agents have no git and cannot see the diff
- Symptom: A read-only reviewer cannot run git diff
- Cause: Reviewers only have Read, Grep, Glob
- Fix: Write the diff to .claude/review/diff.patch (git-ignored) and delete it after the review
- Prevention: documented, orchestrate-feature pitfalls

### 2026-10-09: ESLint scanned agent worktrees (each holds a full copy of the repo)
- Symptom: Duplicate lint errors from files under .claude/worktrees
- Cause: The flat ESLint config lints every folder
- Fix: Ignore .claude/worktrees/ in ESLint; it is also git-ignored
- Prevention: guarded, eslint.config.js ignores .claude/worktrees/; scripts/repo-guards.test.mjs
