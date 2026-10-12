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

### 2026-10-09: Two equal positions broke a move with a 400
- Symptom: Dragging a task between two tasks with the same position was refused
- Cause: The check required afterId to be strictly above beforeId before the rebalance could repair the tie
- Fix: Only an inverted order is refused; ties are rebalanced first (tasks.move) and position is limited to +/-1e9
- Prevention: guarded, apps/server/src/actions/task-moves.test.ts

### 2026-10-12: Never call another setState inside a state updater function
- Symptom: The error path of the quick add bar called setIgnored inside setTitle(current => ...)
- Cause: Updaters must be pure; React may run them twice
- Fix: Read the latest value through a ref and call the setters side by side
- Prevention: guarded, quick-add-bar-fixes.test.tsx
