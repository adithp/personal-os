# Global search

## Purpose
One search across everything.

## Behavior
- Opened with Ctrl K (cmdk) or the dashboard search bar.
- Searches tasks, notes, projects, calendar, habits, finance, subscriptions (Postgres full-text), plus Gmail and Drive (live Google search).
- Two modes: keyword, and natural language (semantic search with embeddings plus the fast model to understand the question).
- Results grouped by module with module colors.
- Built so far: keyword search over tasks (title and description, done and archived included) and tags (name). The other modules, natural language mode, Gmail and Drive join later (the list above is the plan).
- Keyword matching: every typed word must start a word in the title or description (AND, case-insensitive, any language including Malayalam, Postgres `simple` configuration, decision 42). Mid-word matches ("ent" for "rent"), typos and accents are not handled. Tags match by name prefix, only when the search is one word (a leading # is ignored).
- Tasks: live tasks only (deleted tasks and subtasks of a deleted parent are left out and return after an undo). Done and archived tasks rank at half weight; the order is rank (title over description), then most recently changed. 5 results per group (API maximum 20). A plain-text snippet of the description is sent only when the title alone does not match all words. Tags: exact name first, then shorter names, then by name.
- Limits: the text is trimmed, control characters (NUL too) become spaces, 1 to 100 characters. The request is a POST so the text stays out of access logs. Recent items, highlighting, loading and error states: see DESIGN.md section 9.
- The same palette runs commands (placeholder "Search or type a command…"): open any module, switch the theme (dark, light, system), and toggle dock auto-hide. Commands that create things (new task, new note) come later; there are no dashboard-switching commands because multiple dashboards do not exist yet.

## Example
"Find the notes and emails related to my college project."

## Done when
One search finds anything in the app in under a second for keyword mode.
