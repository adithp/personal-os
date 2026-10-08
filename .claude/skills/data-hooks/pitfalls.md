# Pitfalls: data-hooks

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10-09: A failed optimistic change rolled back unrelated cache entries
- Symptom: A flicker of another task reverting after a failed change
- Cause: The snapshot covered every cached task query
- Fix: patchEverywhere snapshots only the entries containing the task id
- Prevention: documented, data-hooks SKILL (snapshot only entries that contain the task)

### 2026-10-09: Two quick tag changes overwrote each other
- Symptom: Ticking tag A then B quickly left only B
- Cause: tagIds were computed from stale props and the cache did not change optimistically
- Fix: applyPatch applies tagIds optimistically; the tag menu reads the latest ids
- Prevention: guarded, apps/desktop/src/modules/tasks/detail/task-detail-review-fixes.test.tsx
