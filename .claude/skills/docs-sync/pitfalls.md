# Pitfalls: docs-sync

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10-08: Docs drifted from the code (hosting moved from Oracle to AWS in some files only)
- Symptom: Several docs still said Oracle after the server moved to AWS
- Cause: No check linked code and docs
- Fix: Commits that change mapped code must change its docs or say [docs-ok] <reason>; CI repeats the check
- Prevention: guarded, scripts/docs-check.mjs, docs/doc-map.json, .githooks/commit-msg, CI
