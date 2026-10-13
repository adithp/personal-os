# Tasks Feature 5: Favorites and Manage tags (research and decisions)

Status: decisions made by the research agent on 2026-10-13, for the owner to review. Nothing here is built yet. The mockup is `docs/design/mockups/tasks-favorites.html` (open it in a browser; the button at the top right switches dark and light).

What is already fixed (not redone here): a favorite is a saved shortcut to a filtered view of My tasks, stored on the server in `task_favorites`, with an auto color and icon that can be changed. The side panel has a Favorites list with a + button, and Overview has a Favorites section of glossy tiles. Manage tags is a dialog to rename, recolor and delete tags.

## 1. What I checked in our own code first
- My tasks already reads its filters from the URL: `status`, `priority`, `tag` (a list of tag **ids**, not names), `due`, `archived`, `group`, `sort` (`apps/desktop/src/modules/tasks/my-tasks-search.ts`). Its comment already says "Favorites open My tasks this way". So a favorite can simply store these values.
- Because the tag filter uses ids, renaming a tag never breaks a favorite. Deleting a tag does leave a dead id, so the delete must clean favorites too (decision 14).
- `tags` has `deleted_at` (soft delete) and names are unique ignoring case among live tags (decision 46). `entity_tags` has no `deleted_at`; its rows are real links.
- Tag colors come from `TAG_PALETTE` in `packages/shared/src/tags.ts` (10 module pastels in a cycle).
- The side panel rows are 32 px, 18 px Tabler icons, `rounded-chip`, hover `bg-tint`. The stub `favorites-list.tsx` hides itself when the panel is collapsed.
- There is no general Dialog component in `packages/ui`; the closest one is the keyboard-shortcuts dialog in `my-tasks/shortcuts-help.tsx` (glass-strong, radius 16, `role="dialog"`, `aria-modal`).

## 2. Sources I actually opened
Product help pages:
1. Todoist, favorites: https://www.todoist.com/help/todoist/features/add-a-project-label-or-filter-to-favorites-in-todoist-zezDfvSK
2. Todoist, labels: https://www.todoist.com/help/articles/introduction-to-labels-dSo2eE
3. Linear, favorites: https://linear.app/docs/favorites
4. Linear changelog, label descriptions and archiving (Oct 2025): https://linear.app/changelog/2025-10-09-label-descriptions-and-archiving
5. Things 3, using tags: https://culturedcode.com/things/support/articles/2803581/
6. Apple Reminders (Mac), tag reminders: https://support.apple.com/guide/reminders/tag-reminders-remn45640f4f/mac
7. Apple Reminders (Mac), custom Smart Lists: https://support.apple.com/guide/reminders/create-custom-smart-lists-remnfec66479/mac
8. Notion, navigate with the sidebar: https://www.notion.com/help/navigate-with-the-sidebar
9. Asana, navigating Asana: https://help.asana.com/s/article/navigating-asana-video?language=en_US
10. Asana sidebar tour (third party): https://waynehedlund.com/a-tour-of-asanas-sidebar-navigation/
11. Asana "Set color & icon" (third party tutorial): https://www.guideflow.com/tutorial/how-to-change-projects-color-in-asana
12. GitHub Docs, managing labels: https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels

UX guidance:
13. NN/g, confirmation dialogs: https://www.nngroup.com/articles/confirmation-dialog/
14. Smashing Magazine, managing dangerous actions (2024): https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/

Design references (screenshots viewed in the browser):
15. Dribbble, "Task & Collaboration Team Management Dashboard" by Conceptzilla: https://dribbble.com/shots/19198544-Task-Collaboration-Team-Management-Dashboard-Design
16. Dribbble, "Tags management" by Denys Sergushkin: https://dribbble.com/shots/14763346-Tags-management
17. Dribbble, "Task Manager Navigation, Dark mode" by David Markov: https://dribbble.com/shots/25263886-Task-Manager-Navigation-Dark-mode
18. Dribbble, "Glassmorphism Sidebar" by Valentino: https://dribbble.com/shots/22938556-Glassmorphism-Sidebar

Tried but could not use: Mobbin (the page showed "Something went wrong"), Behance (the browser extension was not allowed on that site), Linear's labels doc page (404 for the fetch tool; I used its changelog instead), TickTick's tag help page (the fetch tool returned a cut page; I only have TickTick facts from a search summary, so I do not rely on them below).

## 3. What the research found

### Favorites in other apps
- **What can be a favorite.** Todoist: projects, labels and filters [1]. Linear: issues, projects, views, labels and more [3]. Notion: pages [8]. Asana: projects (star icon) [9]. Apple Reminders has no "favorites", but a Smart List built from tags or filters, with its own name, color swatch and icon, plays the same role [7].
- **How you add one.** A star in the page header is the common pattern (Linear [3], Notion [8], Asana [9]). Todoist uses a heart next to a label or filter, or "Add to favorites" in a project's menu [1].
- **Where they show.** A Favorites section in the sidebar. Linear and Notion show it only after the first favorite exists [3][8].
- **Order.** Linear lets you drag favorites and put them in folders [3]. Todoist does not let you order favorites on their own; they follow the order of the source lists [1]. Notion's own help does not say how favorites are reordered [8].
- **Removing.** Hover the item and click X (Linear) or use its menu, "Remove from favorites" (Todoist, Notion) [1][3][8].
- **Limits.** None of the opened docs give a limit (Todoist [1], Linear [3], Notion [8]).
- **Color and icon.** Asana has one "Set color & icon" popup with a swatch palette [11]. Apple Reminders asks for name, color swatch and icon when a list is made [7].

### Tag management in other apps
- **Where.** A dedicated place: Things has a Tags window (Window, Tags) where you create, rename and delete tags [5]; Linear and GitHub have a labels page in settings [4][12]; Todoist edits a label from its menu in "Filters & Labels" [2].
- **Usage counts.** Linear's label settings show how many issues use each label and when it was last used, "to help you decide what to clean up" (from the Linear docs search summary; the changelog [4] confirms the bulk, merge and rules features). I could not open the full Linear labels page, so the count detail is **partly unverified**.
- **Delete semantics.** Deleting removes the tag from every item, the items stay: GitHub [12], Apple Reminders [6]. Linear says delete is permanent and added **archive** as a softer option that keeps the label on old issues [4]. Todoist keeps a deleted label visible on completed tasks [2] (an odd half-state).
- **Delete that touches a saved view.** Apple Reminders: when a deleted tag is the only rule of a Smart List, it asks you to confirm deleting both the tag and the Smart List [6]. This is the exact case of our tag favorites.
- **Merge.** Apple Reminders merges by renaming a tag to a name already in use [6]. Linear has an explicit "merge labels" action (Oct 2025) [4]. Things, Todoist and GitHub docs do not mention merge [2][5][12].
- **Recolor.** GitHub: edit the hex, or a button picks a random color [12]. Todoist: a color menu [2].

### UX guidance on deleting
- Do not overuse confirmations; people stop reading them. Be specific (name the thing and what happens), label the button with the verb ("Delete tag", not "OK"), no default answer, and offer undo [13].
- Undo suits reversible actions; a confirmation suits permanent or high-impact ones; an inline confirmation suits accidental clicks that are not critical [14].

### Design references (what I saw, in my own words)
- **[15]** A light sidebar with a small uppercase muted "Favorites" header and a collapse chevron. Each favorite is one quiet row: a tiny outlined colored shape (star, circle, square, triangle) and the name. Very calm; color is the only accent.
- **[17]** A dark sidebar where each section header (title plus chevron) shows a + and a "more" button at the right. Icons are thin and grey; the active row has a soft filled background.
- **[18]** A glass sidebar on a photo: rounded translucent panel, thin icons, a small bright marker on the active row. Shows that a glass panel stays readable when rows are simple.
- **[16]** A tag manager where each tag is shown as its colored chip, with small edit and delete icons at the end of the row, and a multi-select checkbox. Clear, but busy (three columns, tabs, checkboxes).

**What I chose and how I adapted it:** the calm row of [15] (color is the only accent) with the hover-only + and "more" of [17], drawn with our tokens: a 16 px rounded square in the favorite's pastel with a dark Tabler glyph (our icon-square rule), 32 px rows like the rest of the panel, `bg-tint` hover. For Manage tags I took the "one row per tag, actions at the end" idea of [16] but cut it down: one column, a color dot, the name, a muted count, and actions that appear only on hover or focus (CONTEXT.md: "details on hover or selection"). No tabs, no checkboxes, no bulk select.

## 4. Decisions

Confidence: **high** = backed by several sources and our docs; **medium** = backed by a source, but a real choice; **low** = my judgment, no source.

### Favorites

**D1. A favorite stores a My tasks view, nothing else.** The view is the same set the URL already uses: status, priority, tag ids, due, archived, group, sort (not the open task). A "tag favorite" is simply a view with one tag. Opening a favorite goes to `/tasks/my-tasks?...` with those values.
- Why: My tasks already validates these from the URL and drops bad values, so old favorites never crash [our code]. Todoist favorites a label or a filter as two kinds [1]; one kind is simpler for us.
- Rejected: separate "tag" and "filter" kinds (more code, same result); saving the Cards/List/Board choice (that is a device setting today; see open point O2).
- Confidence: high.

**D2. The + button opens a small menu: "Save this view" and the list of tags.**
- "Save this view" is enabled only on My tasks when at least one filter, sort or group differs from the default; otherwise it is disabled with the hint "Set a filter on My tasks first".
- Below it, "Tags" lists your tags (color dot and name, a search field when there are more than 8); picking one adds that tag as a favorite at once.
- After adding, the new row appears with its name selected for renaming (Enter keeps it, Esc keeps the suggested name).
- Why: the owner fixed the + button as the entry point. Todoist lets you favorite both labels and filters [1]; Apple Reminders builds a Smart List straight from tags [7].
- Rejected: a star in the My tasks header (the pattern of Linear, Notion and Asana [3][8][9]); good, but not in the agreed design and it touches `my-tasks/**`, so it is listed under Suggested changes S1.
- Confidence: medium.

**D3. Names are suggested and can be edited.** A tag favorite is named after the tag ("home"). A view is named from its filters in plain words, joined with " · ", for example "High priority · This week" or "In progress · work". Names are 1 to 40 characters, trimmed, and do not need to be unique. Rename inline in the panel (menu "Rename", or F2 on the focused row): Enter saves, Esc cancels, an empty name puts the old one back.
- Why: Apple Reminders asks for a name on creation [7]; inline rename keeps it light. No source sets a length; 40 matches our tag limit.
- Confidence: medium.

**D4. Auto color and icon, changed in one small popover.**
- Color: a tag favorite takes the tag's color; a view takes the next color of `TAG_PALETTE` (the same cycle as tags, counted over favorites).
- Icon: tag favorite `hash`; otherwise from the first filter that is set: priority `flag`, due `calendar`, status `progress`, archived `archive`, only sort or group `adjustments-horizontal`.
- "Color and icon" in the row menu opens one glass popover: a row of the 10 palette swatches and a grid of 12 icons (hash, flag, calendar, progress, archive, star, bolt, briefcase, home, heart, book, target). No free hex input.
- Why: Asana has one "Set color & icon" popup with a swatch palette [11]; Apple Reminders asks for a swatch and an icon [7]. Keeping to our 10 module pastels keeps dark text readable on every color (DESIGN.md section 3).
- Rejected: emoji (does not match the Tabler-only rule in DESIGN.md), any hex color (could break contrast).
- Confidence: medium.

**D5. Side panel row look.** Under the nav, a gap, then the header row "Favorites" (11 px, muted) with a + icon button (24 px hit area) on the right. Each favorite is a 32 px row like the nav rows: a 16 px square (radius 5) in the favorite's color with a 12 px dark Tabler glyph, then the name (13 px, text-secondary, one line with ellipsis). Hover: `bg-tint`. On hover or focus a small "more" button (dots) appears at the right. The row whose view matches the current URL gets the active look of nav rows (`bg-tint`, text-primary, medium). No count in the row (minimal; the tile shows the count).
- Collapsed panel (56 px): only the 16 px squares, centered, each with a tooltip of its name; the + stays as an icon button. (Today's stub hides everything when collapsed; CONTEXT.md section 4 describes "colored squares", so this matches the plan.)
- Why: calm rows with color as the only accent [15]; hover-only actions [17]; our nav row sizes and DESIGN.md icon squares.
- Confidence: high.

**D6. Overview tiles.** The Favorites section shows the favorites as compact pastel tiles (the existing Tile compact size), in a grid of columns at least 180 px wide, in the same order as the panel, at most 6 (the panel has them all). Each tile, following the DESIGN.md Tile rules: name top left (12, medium), the 24 px arrow-up-right action top right, the glyph and the big number of **open tasks** in that view with "open", and one 11 px line: "2 overdue" or "Nothing overdue". Liquid glass adds the rim and shine as on every tile. Clicking anywhere on the tile opens the view.
- Why: the DESIGN.md tile already has exactly these parts; showing a count makes the tile worth its space. The Tasks page must not scroll as a whole (DESIGN.md section 8), so a cap keeps the Overview tidy at 1100×700.
- Rejected: showing all favorites on Overview (crowds the page); a separate "Show all" page (extra screen).
- Confidence: medium (the cap of 6 is my judgment, no source).

**D7. Empty states.** Overview hides the Favorites section until the first favorite exists. The side panel always shows the "Favorites" header with + (so you can add one), and under it one muted line, "Save a view or a tag here", when the list is empty.
- Why: Linear and Notion show the Favorites section only once the first favorite exists [3][8]; our + must stay visible to add one.
- Confidence: high.

**D8. Reorder by drag, with a keyboard way.** Drag a favorite up or down in the panel with the existing dnd-kit setup (keyboard drag: Space lifts, arrows move, Space drops, Esc cancels, as in My tasks). The row menu also has "Move up" and "Move down". New favorites go to the end. Tiles follow the panel order. Order is saved on the server (`position`, the same "between two neighbours" idea as `tasks.move`).
- Why: Linear lets you drag favorites [3]; Todoist's fixed order is a known limit [1]. dnd-kit is already installed (decision 54).
- Rejected: folders inside favorites like Linear [3] (too much for one user and a short list).
- Confidence: high.

**D9. At most 12 favorites.** When there are 12, the + menu items are disabled with "12 favorites is the most. Remove one first." The server refuses a 13th with 409 `favorites_limit`.
- Why: the sources state no limit [1][3][8]; this is my choice to keep the panel short and fit the panel without scrolling at the minimum window size.
- Confidence: low (owner may want another number or no limit).

**D10. Remove without asking, with Undo.** "Remove from favorites" in the row menu (or Delete on a focused row) removes it at once and shows the toast "Favorite removed." with Undo. Removing a favorite never changes any task or tag.
- Why: NN/g and Smashing: undo for reversible, low-risk actions; confirmations lose their power when overused [13][14]. Linear removes with one click on X [3].
- Confidence: high.

**D11. The same view twice is not saved twice.** If a favorite with the exact same view already exists, the server returns that one (like `tags.create` returns the existing tag), and the app shows "Already in favorites" and highlights it.
- Why: consistency with our `tags.create`; no source on this. 
- Confidence: medium.

**D12. Favorites keyboard.** The rows are links in the panel's tab order. Enter opens. Shift F10 or the Menu key opens the row menu (menu roles and arrow keys, as DESIGN.md "Menus and popovers"). F2 renames, Delete removes (with Undo). No new Ctrl shortcuts and no new page letter keys.
- Why: our rule of page-scoped plain keys and no new Ctrl shortcuts (docs/features/tasks-redesign.md, DESIGN.md section 9). Linear's "O then F" chord [3] was rejected for that reason.
- Confidence: high.

### Manage tags

**D13. Dialog layout.** A centered glass-strong dialog, 440 px wide, radius 16, over a dimmed page (like the command palette and the shortcuts dialog). From top to bottom:
1. Title "Tags" (16, semibold) with the count in muted text ("9"), and a close X.
2. A search field "Find a tag", shown only when there are more than 8 tags.
3. The list, sorted A to Z, max height 360 px, scrolling inside. Each row is 36 px: a 12 px color dot (a button), the name (13 px), the muted usage count at the right ("12 tasks", "Not used"), and on hover or focus two icon buttons: Rename (pencil) and Delete (trash).
4. Footer: one quiet line, "Deleting a tag removes it from its tasks. The tasks stay." and a Done button.
- No create button: tags are created by typing `#tag` in quick add or in the detail panel (see open point O4).
- Why: one place to manage tags like Things' Tags window [5]; counts help clean up (Linear [4], partly unverified); the one-row-per-tag idea of [16], made quieter.
- Rejected: a full settings page (more navigation); bulk select and checkboxes [16] (too much for one user).
- Confidence: medium.

**D14. Where it opens.** "Manage tags…" at the end of the tag chip menu (where Recolor already lives) and at the end of the Tag group in the My tasks Filter menu.
- Why: next to where tags are used, like Todoist's label menu [2]. Both places sit in files outside Feature 5's planned ownership (`my-tasks/**`, `detail/**`), so the contract must add a small slot (see Suggested changes S3).
- Confidence: medium.

**D15. Recolor.** Clicking the color dot opens a popover with the 10 palette swatches (the current one ringed). A choice saves at once (optimistic) with no toast.
- Why: same palette and behaviour as the chip menu today (decision 46). GitHub's random color button [12] is not needed with 10 swatches.
- Confidence: high.

**D16. Rename, and merge by renaming.** Rename turns the name into an input (Enter or F2 on the row; Enter saves, Esc cancels). The same rules as today apply (no spaces or #, 1 to 40 characters, no invisible characters); errors show under the input in the danger color. If the new name equals another tag's name (ignoring case), the row shows an inline question: "'home' already exists. Merge 'house' into it? 5 tasks will get 'home'." with the buttons **Merge** and **Cancel**. Merge moves every task (and favorite) from the old tag to the other, removes the old tag, and shows "Tags merged." with Undo.
- Why: Apple Reminders merges exactly this way [6]; Linear added merge in 2025 [4]. Quick add creates tags automatically, so typos make duplicates; without merge, the only fix would be deleting a tag and losing its links.
- Rejected: a separate Merge button and picker (more UI for a rare action); no merge at all (duplicates stay forever).
- Confidence: medium.

**D17. Delete semantics.** Deleting a tag soft-deletes it, removes it from every task that has it (open, done and archived; the tasks stay), and removes it from favorites: a favorite whose only filter was that tag is removed; other favorites just lose that tag id. Undo puts all of it back. If a new tag with the same name was made before Undo, Undo fails with the message "A tag named 'home' exists again. Rename it first."
- Why: GitHub and Apple Reminders remove the tag from all items and keep the items [12][6]; Apple Reminders also handles the Smart List built on that tag [6]. Todoist's "stays on completed tasks" [2] and Linear's archive [4] were rejected as extra states for one user.
- Confidence: high.

**D18. Delete confirmation: only when the tag is in use, inline, plus Undo.**
- Tag used by no task and no favorite: deleted at once, toast "Tag deleted." with Undo.
- Otherwise the row turns into an inline question: "Delete 'home'? It is removed from 12 tasks and 1 favorite. The tasks stay." with **Delete tag** (danger text) and **Cancel**. Focus goes to Cancel (no default destructive answer). After deleting, the toast "Tag deleted." with Undo.
- Why: be specific, use the verb on the button, no default answer, and keep undo [13]; inline confirmation for non-critical clicks [14]; Apple Reminders asks when a Smart List depends on the tag [6]. A type-to-confirm step [13] is too heavy because Undo exists.
- Confidence: high.

**D19. Manage tags keyboard.** The dialog traps focus; Esc closes it (or first cancels an open rename or question). Up and Down move between rows; Enter or F2 renames; Delete starts delete; Tab reaches the dot, rename and delete buttons of the focused row. Focus returns to the menu item that opened the dialog.
- Why: DESIGN.md menus and the existing dialog behaviour; no source needed beyond our rules.
- Confidence: high.

### Errors, loading and server rules

**D20. Errors and loading.** All changes are optimistic with rollback and the normal error toast (the data-hooks pattern). The dialog shows three muted skeleton rows while loading, and "Could not load tags. Try again" with a Retry button on failure. The panel list shows nothing while loading (no jump: the header is always there), and a muted "Could not load favorites" with Retry on failure. A favorite whose view no longer matches any task just opens My tasks with its empty sections (normal My tasks empty states).
- Confidence: high.

**D21. Permission levels.** `tags.delete` and `tags.merge` are destructive (they change many tasks; the AI must ask first, decision 38); `favorites.delete` is write (it changes no task data). Pressing the button in the app counts as the confirmation for the AI rule, as for `tasks.delete`.
- Confidence: medium.

## 5. Data and API outline (for the contract; not a final schema)

`task_favorites` (RLS on, own rows only):
- `id` uuid, `user_id`, `created_at`, `updated_at`, `deleted_at` (soft delete, for Undo)
- `name` text, 1 to 40 characters
- `color` text, one of `TAG_PALETTE`
- `icon` text, one of the 12 icon keys in D4
- `view` jsonb, checked by a Zod `favoriteViewSchema` in `packages/shared`: `{ status?: ('todo'|'doing'|'done')[], priority?: (1|2|3|4)[], tagIds?: uuid[], due?: DueFilter, archived?: boolean, group?: GroupKey, sort?: SortKey }`; at least one key must be set
- `position` (same type and "between neighbours" rule as `tasks.position`)
- Index on `user_id`; partial index on `(user_id, position)` where `deleted_at is null`

Server rules:
- At most 12 live favorites per user (409 `favorites_limit`).
- Every tag id in `view.tagIds` must be a live tag of the same user (400 otherwise).
- Creating a favorite whose view equals an existing live one returns that one (D11). "Equal" means the same keys and the same values, lists compared as sets.
- Deleting a tag updates favorites in the same transaction (D17).

Actions (all in the registry, with Zod input, permission and undo):
- `favorites.list` (read), `favorites.create` (write; undo = delete), `favorites.update` (write: name, color, icon; undo = the old values), `favorites.move` (write: afterId, beforeId; undo = old position), `favorites.delete` (write, soft; undo = `favorites.restore`), `favorites.restore`.
- `tags.list` returns a new `taskCount` (live tasks, any status, archived included) and `favoriteCount`.
- `tags.delete` (destructive; undo = `tags.restore`, which re-adds the tag links and the favorite changes it removed).
- `tags.merge` (destructive; input `sourceId`, `targetId`; undo = `tags.unmerge`, which brings the source tag back and moves back only the links it moved).
- The existing `tags.update` refuses a name used by another live tag (409); the app turns that into the merge question of D16.

Routes (names to be fixed in the contract): `GET/POST /task-favorites`, `PATCH/DELETE /task-favorites/:id`, `POST /task-favorites/:id/move`; `DELETE /tags/:id`, `POST /tags/:id/merge`.

## 6. Suggested changes (I kept the existing docs and decisions; these are proposals)
- **S1. A star in the My tasks header** ("Add to favorites" / "In favorites") as a second way to save the current view. Linear, Notion and Asana all put the star in the page header [3][8][9]. It touches `my-tasks/**`. Keep the + button either way.
- **S2. DESIGN.md has no Dialog component.** Add one short entry (glass-strong, radius 16, dimmed page, title 16 semibold, close X, focus trap, Esc closes) so Manage tags and the shortcuts dialog share it.
- **S3. Contract slots outside Feature 5 ownership.** The "Manage tags…" items live in the tag chip menu (`detail/**`, `shared/`) and in the Filter menu (`my-tasks/**`). The orchestrator should add a small `openManageTags()` slot in the contract so `ui-dev` B only owns `manage-tags/**`.
- **S4. Docs to update when built:** docs/DATABASE.md (`task_favorites`), docs/features/tasks.md (actions list and the delete and merge rules), docs/features/tasks-redesign.md (Feature 5 status, collapsed panel shows squares), and a new DECISIONS.md row for D9, D16, D17.

## 7. Open points for the owner
- **O1.** The limit of 12 favorites and the 6 tiles on Overview (D6, D9) are my judgment. Other numbers, or no limit?
- **O2.** Should a favorite also remember Cards, List or Board? Today that choice is saved on the device only, so I left it out.
- **O3.** When you change filters while a favorite is open, should the panel offer "Update favorite"? I left it out (minimal); you would remove and save again.
- **O4.** Should Manage tags also create tags (a "New tag" row like Things [5])? I left it out because quick add and the detail panel already create them.
- **O5.** Merge by renaming (D16) instead of a separate Merge button: OK?
- **O6.** Should "Manage tags" also be a command in the Ctrl K palette?

## 8. What I could not verify
- Linear's label settings page (usage count and last-used columns) comes from a search summary; the page itself returned 404 to the fetch tool.
- TickTick tag management (pin, edit, delete, drag order) comes only from a search summary of its help page; I did not use it for any decision.
- Mobbin and Behance screenshots: not viewed (Mobbin errored; Behance was blocked for the browser extension). The four Dribbble shots above were viewed as screenshots.
- No source gave limits on favorites or tags; D6 and D9 are judgment.
