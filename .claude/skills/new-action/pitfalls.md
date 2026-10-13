# Pitfalls: new-action

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

_No lessons yet._

### 2026-10-13: An undo must relink what still exists and re-check the same limits as the forward action
- Symptom: Undo of a tag delete skipped trashed tasks, and an undo could bring back a 13th favorite or a favorite with a dead tag
- Cause: The undo used "live" instead of "still exists" and skipped the checks of the forward action
- Fix: relinkTasks selects tasks without the live filter; restoreFavorites counts the limit, strips dead tags and skips duplicate views
- Prevention: guarded, tag-management.test.ts and favorites.test.ts

### 2026-10-13: Read-then-write limits (12 favorites, same view) need a lock
- Symptom: Two creates at once could pass the check and make a 13th favorite or a duplicate
- Cause: The check and the insert are separate statements and actions cannot run raw SQL locks
- Fix: withFavoritesLock queues writes per user in the server process; a lock helper in UserScope is the real fix for several instances
- Prevention: documented, tasks-redesign.md Feature 5 known limits
