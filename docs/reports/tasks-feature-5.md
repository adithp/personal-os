# Tasks Feature 5: Favorites and Manage tags (report)

Built in the autonomous loop (decision 58). Waiting for the owner's check. Nothing is ticked in ROADMAP.md. Design and product decisions come from the research memo `docs/design/research/tasks-favorites.md` (made by a research agent with sources: review it).

## Checks
Lint, typecheck, build, `pnpm docs:check` and all tests pass (108 test files, 1917 tests). Not run in the real Tauri window.

## What was built
- **Favorites:** a favorite is a saved My tasks view (filters, sort, group). In the Tasks side panel: header "Favorites" with a + button ("Save this view" on My tasks, or pick a tag), rows with a pastel square and icon, rename (F2), color and icon picker, Move up/down, drag to reorder, Remove with Undo. Collapsed panel shows squares. At most 12. Overview shows up to 6 tiles with the open count and an overdue line.
- **Manage tags:** "Manage tags…" in the tag chip menu and the Filter menu opens a dialog: recolor, rename (a name that exists asks to merge), delete (asks only when in use), usage counts, inline Undo.
- **Server:** table `task_favorites`; actions `favorites.*`, `tags.delete`, `tags.merge` (destructive) and their undos `tags.restore`, `tags.unmerge`; `tags.list` has `taskCount` and `favoriteCount`.

## Migrations to apply (you run them)
`packages/db/drizzle/0006_task_favorites_table.sql` and `0007_task_favorites_updated_at_trigger.sql`. In PowerShell:

```powershell
cd C:\Users\adith\OneDrive\Documents\personal-os
pnpm db:migrate
```

Check in Supabase: the table `task_favorites` exists with Row Level Security on and the policy `task_favorites_own_rows`; the trigger `task_favorites_set_updated_at`; `drizzle.__drizzle_migrations` has 8 rows. Until then the app shows "Database update needed: run pnpm db:migrate".

## Decisions made by the research agent (review these)
12 favorites at most; 6 Overview tiles; a favorite does not remember Cards/List/Board; merge happens by renaming a tag to an existing name; delete asks only when the tag is in use; removing a favorite has no question (Undo instead); tag favorites use the tag's color. Full list with sources, alternatives and confidence: the memo.

## Review fixes done
Four reviewers (code, design, security, docs). Fixed: undo of tag delete/merge now also restores the tag on trashed tasks; undo/restore never pass 12 favorites, never bring dead tags or duplicate views back; per-user write queue for favorites; case-insensitive palette colors; de-duplicated ids; chunked merge; keyboard Undo inside the dialog; larger click targets; arrow keys in color/icon grids; error messages with retry; opening a favorite resets sort/group.

## Known limits
- Write queue is in the server process (not a database lock): fine for one server.
- Undo of a tag delete or merge is not offered above 5000 tasks. Undoing a merge leaves the target tag on the tasks.
- Favorites links are all Tab stops (12 at most). The Overview tile is hand-built from the Tile rules.
- 12 favorites plus the nav might scroll the side panel at 1100×700: check by eye.
- Archived or done favorites show "0 open" on Overview.

## Manual test steps
1. Apply the migrations (above), restart `pnpm dev:server` and `pnpm dev:desktop`.
2. My tasks: set Filter to Priority Urgent, click + next to Favorites, "Save this view". Rename with Enter. Open another page, click the favorite: My tasks opens with that filter and the row is highlighted.
3. + then a tag: a tag favorite appears in the tag's color. Try the row menu: Color and icon, Move up/down, drag a row, Remove then Undo.
4. Save 12 favorites: the 13th is refused with the message.
5. Open Overview: tiles with counts. Collapse the side panel: squares with tooltips.
6. Tag chip menu → Manage tags…: recolor the dot, rename a tag to another tag's name (merge question), delete a tag that is in use (question) and Undo (also with the keyboard: the Undo button at the bottom of the dialog).
7. Dark and light mode, 1100×700 window.
