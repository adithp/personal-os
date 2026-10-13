# Research memo: Notes (Step 2, built in stages N1 to N4)

Date: 2026-10-13. Author: research agent (decisions delegated by the owner, decision 62; to be reviewed).
Mockup: `docs/design/mockups/notes.html` (open it in a browser; the buttons at the top switch dark and light, the right panel tab, and the `[[` popup).

## 1. What is already decided (not redone here)
- ROADMAP Step 2: "Notes: TipTap editor, folders, wikilinks, backlinks, tags, templates, daily notes, version history". Step 2b (later): math and callouts, images and attachments, raw markdown mode (CodeMirror 6), local graph.
- docs/DATABASE.md section 3: notes, note_folders, note_versions, note_templates; wikilinks and backlinks are `links` rows with relation `mentions`, rebuilt on every save; tags use `tags` + `entity_tags`.
- Every note is an entity (type `note`, same id). Every data change is an action in the registry. Shared types in packages/shared. Migrations are written by the orchestrator and applied only by the owner.
- TipTap and its extensions are approved for this batch (decision 62). Anything else new is a question (section 7).
- The Tasks module is the model: inner side panel, contract-first build, server-dev and ui-dev agents with file ownership, at most 5 agents at once.

## 2. What the research found
Every point below comes from a page or a package file I opened. Points seen only in search summaries are marked **unverified**.

### TipTap (the editor)
- **Version.** The npm registry (checked with `npm view` on 2026-10-13) lists `@tiptap/react`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-mention`, `@tiptap/suggestion`, `@tiptap/extension-list`, `@tiptap/extension-table`, `@tiptap/extensions` and `@tiptap/pm` all at **3.32.0, published today**; the one before is **3.31.4 (2026-09-30)**. All packages are released together and must share one version. `@tiptap/react` accepts React 17, 18 and 19 as peers [S1]. Tiptap 3.0 became stable in July 2025 (**unverified**: search summary of the release blog).
- **StarterKit v3** includes Blockquote, BulletList, CodeBlock, Document, HardBreak, Heading, HorizontalRule, ListItem, OrderedList, Paragraph, Text; marks Bold, Code, Italic, Link, Strike, Underline; and Dropcursor, Gapcursor, Undo/Redo, ListKeymap, TrailingNode. Any part can be switched off with `StarterKit.configure({ underline: false })` [S2].
- **Other packages** (read from the package type files [S3]): `TaskList` and `TaskItem` are in `@tiptap/extension-list`; `TableKit` (and `renderTableToMarkdown`) in `@tiptap/extension-table`; `Placeholder`, `CharacterCount`, `Focus`, `TrailingNode`, `UndoRedo` in `@tiptap/extensions`. CharacterCount gives `editor.storage.characterCount.words()` and `.characters()` [S4].
- **Markdown.** `@tiptap/markdown` parses markdown into the editor and writes it back: `setContent(md, { contentType: 'markdown' })` and `editor.getMarkdown()`; `editor.markdown.parse()` / `.serialize()` work without the editor view. It uses the `marked` library. Tables and task lists need their extensions and `markedOptions: { gfm: true }`. The docs warn: load all extensions or content is lost, and test round trips [S5]. The docs call it "an early release" that "may have edge cases" [S6]; the launch post (2025-10-15) says it follows CommonMark and round-trips content, and that custom extensions need their own rules [S7].
- **Custom markdown syntax.** A node can bring its own `markdownTokenizer` (`name`, `level: 'inline'`, `start`, `tokenize`) plus `parseMarkdown` and `renderMarkdown`. The official emoji guide shows exactly this for an inline atom node (`:smile:`) [S8]. A guide page on these hooks exists (**unverified**: only seen in a search summary).
- **What the markdown writer does to plain text** (read in the 3.31.4 source [S9]): text outside code is passed through `encodeHtmlEntities` (`&` becomes `&amp;`, `<` `&lt;`, `>` `&gt;`) and then `escapeMarkdownSyntax`, which puts a backslash before `\ ` `` ` `` `*` `_` `[` `]` `~`. So **plain text `[[Note]]` is saved as `\[\[Note\]\]`** and `#my_tag` as `#my\_tag`. Wikilinks therefore must be a real node with its own markdown rules, and every server-side parser must undo these escapes.
- **Mention and Suggestion.** Mention stores `id` and `label` on an inline node and is driven by the Suggestion utility (`char`, `items`, `render`, `command`); several triggers are possible with a `suggestions` array [S10]. Suggestion options include `char`, `allowSpaces`, `allowedPrefixes`, `startOfLine`, `allow` and `findSuggestionMatch` (replace the trigger matching) [S11]. The matching source escapes `char` into a regular expression and cuts the query with `char.length`, so a two-character trigger like `[[` works; with `allowSpaces` the query runs to the end of the text before the cursor [S12]. Mention has **no markdown rules** of its own [S3]. `@tiptap/suggestion` 3.31.4 imports `@floating-ui/dom` directly (a required peer, `^1.0.0`); it is not installed in this repo yet [S3].
- **Keyboard keys inside the editor** (read in the 3.31.4 sources [S3]): Bold Mod-b, Italic Mod-i, Underline Mod-u, Strike Mod-Shift-s, inline Code Mod-e, Code block Mod-Alt-c, Heading Mod-Alt-1..6, lists Mod-Shift-7/8/9, Undo Mod-z, Redo Mod-Shift-z. **Link has no shortcut**, and its `openOnClick` is `true` by default (would navigate the app window).
- **Performance.** Put the editor in its own component; read editor state with `useEditorState`; `shouldRerenderOnTransaction` and `immediatelyRender` control re-renders; React node views are slow in large numbers, so prefer plain HTML node views [S13].
- **Storage formats.** Tiptap does not force a format: JSON is closest to what it uses inside and easy to loop through; HTML is portable; Y.js is only for collaboration [S14].
- **Size** (bundlephobia [S15]): `@tiptap/starter-kit` 3.31.4 about 106 kB gzip (includes core and ProseMirror), `@tiptap/markdown` about 19 kB gzip plus `marked` (about 82 kB minified before gzip), `@tiptap/react` about 9 kB gzip. The desktop build already splits routes (`autoCodeSplitting: true` in `apps/desktop/vite.config.ts`), so this loads only when Notes opens.

### How other notes apps behave
- **Folders vs tags.** Bear has three panels (Sidebar with tags, Note list, Editor) and uses tags instead of folders; `#tag` anywhere in the text, `#multi word#`, nested `#a/b` [S16, S17]. Obsidian uses folders plus tags; tags allow letters, digits, `_`, `-`, `/` (nesting), need at least one non-digit, no spaces, and are case-insensitive (shown with the first casing) [S18]. Apple Notes uses folders (**unverified** for its folder rules; only the title rule below was opened).
- **Titles.** Apple Notes: "The first line of the note becomes the note's title", and notes save automatically [S19]. Obsidian: the file name is the title, and `[[Note name]]` links to it [S20].
- **Wikilinks.** Obsidian: `[[Note]]`, display text with `[[Note|Shown text]]`, heading links with `#`; clicking a link to a missing note creates it; links are updated automatically on rename (a setting, can ask first) [S20]. Bear: type `[[` and start typing a title [S21].
- **Backlinks.** Obsidian shows Linked mentions and Unlinked mentions in the right sidebar, with options to collapse, show more context and sort [S22]; Outgoing links lists links and unresolved/unlinked ones [S23]; Outline lists headings and jumps to them [S24]. Bear's Info panel has note stats, a Table of contents tab and a Backlinks tab (Linked and Unlinked mentions); opened with an info button at the top right [S21].
- **Daily notes.** Obsidian: named `YYYY-MM-DD` by default, optional folder and template, opened from a button, the palette or a hotkey; creates the note if it does not exist [S25]. Logseq: a new journal page each day, filled from a default template [S26].
- **Templates.** Obsidian: a template folder; variables `{{title}}`, `{{date}}` (default YYYY-MM-DD), `{{time}}` (default HH:mm), with optional format strings; inserted at the cursor [S27].
- **Version history.** Obsidian File recovery: a snapshot at most every 5 minutes, kept 7 days, a "Show changes" view, restore or copy [S28]. Notion: a version every 10 minutes while editing and one 2 minutes after the last edit; history 7 days on the free plan; preview before restore; Trash keeps pages 30 days [S29].
- **Autosave.** A reviewed open-source editor change saves about 1 second after typing stops, flushes at once on blur, tab switch, navigation and close, keeps one save in flight, stops on a 409 conflict and offers Reload or Overwrite, and shows "Saving / Saved / Unsaved / Save failed" [S30]. Optimistic concurrency: send the version you read; the server refuses the write if it changed (ETag / If-Match) [S31]. Tauri: `getCurrentWindow().onCloseRequested(async (event) => …)` can run async work and `event.preventDefault()` [S32].

### Design references
- **I could not view design galleries.** No Chrome browser was connected to the browser tools (`list_connected_browsers` returned none). Dribbble pages came back empty to the text fetcher (rendered by script) and Behance answered 403. Dribbble shot titles seen in search results ("Notes App - Dark Mode" by Ceptari Tyas, "Note-taking app" by Oleksii Tymoshenko, "Notes App Dashboard Concept" by Arvin Aradhana) are **unverified**; I did not see the images.
- So the layout pattern comes from the official app docs I opened: **Bear's three panels plus an info panel on the right with Outline and Backlinks tabs** [S16, S21] and **Obsidian's right sidebar with Backlinks, Outgoing links and Outline** [S22, S23, S24], drawn in our own tokens (glass, peach Notes accent, Tabler icons, inner side panel like Tasks).

## 3. Decisions
Confidence: high = several sources and our docs agree; medium = one source or our own consistency; low = my judgement.

**D1. Content format: Markdown is the stored source of truth (`notes.content_md`).**
- Choice: the editor loads markdown with `contentType: 'markdown'` and saves `editor.getMarkdown()`. No JSON column. The server also stores `content_text` (plain text made from the markdown by a shared function) for search, list excerpts and later embeddings.
- Reason: DATABASE.md already plans `content_md`; the later raw markdown mode (CodeMirror, Step 2b) edits the same text with no conversion; the server, search, AI and graph can read markdown with small pure functions and no editor on the server; markdown is portable. TipTap supports it both ways [S5, S7].
- Rules that make it safe: (1) only extensions that have markdown rules are loaded (Underline is switched off: plain markdown has no underline); (2) a round-trip test suite (load, save, compare) for every node we allow, run in CI; (3) parsers on the server undo backslash escapes and the three HTML entities [S9].
- Rejected: TipTap JSON as the source (needs conversion for raw mode, search and AI; DATABASE.md would change); storing both JSON and markdown (two truths that can drift); HTML (no gain for us).
- Confidence: medium (the markdown package is still called an early release [S6]; the tests are the guard).

**D2. Packages and versions.**
- Choice: exact pins (no `^`) at **3.31.4** for `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-list` (task list), `@tiptap/extensions` (Placeholder, CharacterCount), `@tiptap/extension-table` (TableKit) in N1; `@tiptap/extension-mention` and `@tiptap/suggestion` in N2. Desktop only; the server does not use TipTap.
- Reason: 3.32.0 was published today; 3.31.4 has had two weeks of use. All TipTap packages must share one version [S1].
- `@floating-ui/dom` is a required peer of `@tiptap/suggestion` [S3]: a new library, so it is question Q1 (needed from N2).
- Confidence: high.

**D3. Tables, schema and migrations (extends DATABASE.md; exact columns).**
All tables: `id`, `user_id`, `created_at`, `updated_at` (trigger `set_updated_at()`), RLS policy `<table>_own_rows`, composite foreign keys with `user_id`.
- `notes` (N1): `id` (= entities id, composite FK `(id, user_id)` to entities, cascade), `title` text not null (1 to 200), `content_md` text not null default '' (max 200,000 characters), `content_text` text not null default '' (server-made plain text), `folder_id` uuid null (composite FK to `note_folders (id, user_id)`), `pinned` boolean not null default false, `revision` integer not null default 1 (raised by 1 on every content or title change; used for conflicts), `deleted_at`. Unique index `notes_user_title_idx` on `(user_id, lower(title)) where deleted_at is null`. Indexes on `(user_id, updated_at)` and `(user_id, folder_id)`.
- `note_folders` (N1): `name` text (1 to 80), `parent_id` uuid null (composite self FK), `deleted_at`. Unique `(user_id, parent_id, lower(name))` among live folders (two indexes: one for `parent_id is null`). Depth at most 3 (checked by the server). A plain table, not an entity (like tags).
- `notes.daily_date` date null (N3), unique `(user_id, daily_date) where deleted_at is null`.
- `note_templates` (N3): `name` text (1 to 80, unique ignoring case among live), `content_md` text, `is_daily_default` boolean not null default false (partial unique index: at most one true per user), `deleted_at`. A plain table.
- `note_versions` (N4): `note_id` (composite FK to notes, cascade), `title` text, `content_md` text, `reason` text check in (`auto`, `before_restore`, `conflict`), `created_at`. No `deleted_at` (old versions are hard-deleted by the retention rule). Index `(note_id, created_at desc)`.
- Left out for now (see Suggested changes): `properties`, `aliases`, `favorite`, `archived_at`, `is_daily` (replaced by `daily_date is not null`).
- Migrations: the next free numbers when each stage starts (Goals, Search and Realtime may take 0008 onward first). N1: `notes_and_folders` + hand-written `notes_triggers` (updated_at triggers; the search trigger of D17). N3: `note_templates_and_daily` + its updated_at trigger. N4: `note_versions`. Each is listed for the owner with what to check in Supabase.
- Confidence: medium.

**D4. Layout: the Tasks pattern with three columns and an optional right panel.**
- Choice: inside the Notes page (`/notes`):
  1. **Inner side panel** (224 px, collapsible to 56 px, saved on this device), same row style as Tasks: All notes, Today (daily note, N3), Folders (header with a + button; a tree, 3 levels, chevrons), Tags (N3), Templates (N3), Trash. Rows not built yet show "Soon".
  2. **Note list** (272 px glass card): header with the place name and count, a small "Filter notes" field (filters loaded titles on this device), a New note button (N3 adds a menu "From template…"), and rows: title (13, medium, one line), one muted 11 px line with the date and the start of the text. Pinned notes first with a small pin. Sort: Last edited (default), Title, Created.
  3. **Editor** (the rest): a top bar with the folder path (muted), the save status, and icon buttons: right panel toggle and More (Pin, Move to…, Move to Trash). Then the title field (22, semibold, borderless) and the TipTap body. A muted footer line: words count and "Edited 2 min ago".
  4. **Right panel** (264 px glass card, closed by default, saved on this device): a segmented control **Links | Outline | History** (History arrives in N4). Links: Backlinks (count, each with the note title and the line around the link), Outgoing links (unresolved ones muted with "Create"), Tags (N3).
- Narrow windows: below 1240 px wide, opening the right panel shows the side panel collapsed (icons) while it is open, so the editor keeps at least about 420 px at the 1100 px minimum.
- Reason: Bear's three panels plus an info panel with Outline and Backlinks [S16, S21]; Obsidian's right sidebar [S22–S24]; our Tasks side panel is already familiar. The right panel is closed by default to keep the page quiet (CONTEXT 1.6).
- Rejected: one combined sidebar for folders and notes (Obsidian's file tree mixes them; harder to scan); backlinks at the bottom of the note (Obsidian option [S22]; pushes them out of sight on long notes); a floating formatting toolbar (needs `@tiptap/extension-bubble-menu`, more chrome).
- Confidence: medium.

**D5. Editor features by stage.**
- N1: StarterKit without Underline (headings H1 to H3 only, mapped to 22, 16 and 13 semibold), task list (`- [ ]`), TableKit loaded so markdown tables survive a round trip (no insert button yet), Placeholder ("Start writing…"), CharacterCount (words in the footer), Link with `openOnClick: false` and `autolink: true`. Markdown typing shortcuts (`# `, `- `, `1. `, `> `, ```` ``` ````, `[ ] `) come with StarterKit and the list package.
- N2: wikilinks (D6), and a **slash menu** (`/` at the start of an empty line or after a space; uses the same Suggestion utility): Heading 1, 2, 3, Bullet list, Numbered list, Checklist, Quote, Code block, Table (3 by 3), Divider; inside a table also Add row, Add column, Delete row, Delete column, Delete table.
- Not in Step 2: images and files (pasted images are dropped, because no image extension is loaded), math, callouts, syntax colors in code blocks (Shiki, Q6), raw markdown mode, embeds.
- Reason: everything listed has markdown rules [S3, S5]; the slash menu gives access without a toolbar.
- Confidence: medium.

**D6. Wikilink syntax and node.**
- Choice: markdown text `[[Note title]]` or `[[Note title|shown text]]` (Obsidian syntax [S20]). In the editor it is an inline atom node `wikiLink` made with `Mention.extend({ name: 'wikiLink', … })`, attributes `target` (the title as written) and `label` (optional), plus a `markdownTokenizer` (`level: 'inline'`, `start: src.indexOf('[[')`, pattern `^\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]`), `parseMarkdown` and `renderMarkdown` (writes `[[target]]` or `[[target|label]]`). The node is drawn with plain HTML (no React node view [S13]): peach underline for a resolved link, dashed muted underline for an unresolved one.
- Autocomplete: typing `[[` opens a glass menu (Menus and popovers style) with matching note titles (from `GET /notes/titles`, cached), arrow keys, Enter inserts; the last row is "Create "<typed text>"" which inserts the link (the note itself is created when you click the link, as in Obsidian [S20]). `allowSpaces: true`, `allowedPrefixes: null`. A plain `]]` closes the menu.
- Click a link: opens that note (same page). Click an unresolved link: creates the note with that title in the current folder and opens it. Heading targets `[[Note#Heading]]` are kept in the text and resolve to the note (jump to the heading is later).
- Reason: plain text brackets would be saved escaped (`\[\[`) [S9], so a node with its own markdown rules is required; Mention already gives the suggestion plumbing [S10, S11]; the emoji guide shows the inline tokenizer pattern [S8]. Storing the title, not the id, keeps the markdown readable in raw mode and in exports.
- Rejected: storing note ids in the markdown (unreadable in raw mode); a mark over text (editable brackets get escaped); plain text plus decorations (escaping again).
- Confidence: medium (needs the round-trip tests; risk R2).

**D7. Titles: a separate title field, unique per user (ignoring case).**
- Choice: the title is its own field above the body (not the first line). A new note is "Untitled" (then "Untitled 2", …) with the title selected so you just type. Titles cannot contain `[`, `]`, `|` or `#` (they would break link syntax) and are trimmed. Two live notes cannot share a title (ignoring case); the server answers 409 `note_title_taken` and the field shows "A note with this title exists." Restoring a note from Trash whose title is taken adds " (2)".
- Reason: links resolve by title, so titles must be unique and stable (Obsidian file names [S20]); a first-line title (Apple Notes [S19]) would rename the note, and rewrite links, while you edit the first line.
- Rejected: first line as title; non-unique titles with a picker (ambiguous links).
- Confidence: medium.

**D8. Rename updates links.**
- Choice: renaming runs `notes.rename`. In the same transaction the server rewrites `[[Old]]`, `[[Old|x]]` and `[[Old#h]]` (ignoring case, outside code) in every live note that links to it (found through `links` rows), raises their `revision`, and re-resolves notes that had an unresolved `[[New title]]`. Toast: "Renamed. Updated links in 3 notes." with Undo (the undo is `notes.rename` back, which rewrites again). Always on, no question (single user).
- Reason: Obsidian does this automatically (setting) [S20]; links stay correct.
- Confidence: medium.

**D9. Link rebuild on save (server-side parse).**
- Choice: every save of content runs, in the same transaction: parse wikilink targets from `content_md` (shared pure function `parseWikilinks`: skips fenced and inline code, undoes escapes), resolve each target to a live note by `lower(title)`, then make the `mentions` links from this note equal that set (insert new, soft-delete the missing). Self-links are skipped (the database refuses them). Unresolved targets are not stored; when a note is created or renamed, the server finds notes containing `[[` + that title with an `ILIKE` scan and rebuilds their links (fine for thousands of notes for one user).
- Backlinks query: live `mentions` links whose target is the note and whose source is a live note; each with a context line (the paragraph around the first link, cut to 160 characters, from `content_text`).
- Reason: DATABASE.md already says "rebuilt on every save"; parsing on the server means the AI and future raw mode get the same links as the editor.
- Confidence: high.

**D10. Tags inside notes (N3).**
- Choice: `#tag` in the text (Obsidian rules [S18]: letters, digits, `_`, `-`, `/`; at least one non-digit; no spaces; must follow a space or line start; not in code; not a heading). On each save the server parses them (`parseTags`, undoing `\_`), finds or creates each tag ignoring case (same helper as `tasks.create` `tagNames`), and makes the note's `entity_tags` equal that set. In the editor `#tag` is plain text styled by a decoration (dark text on a soft chip of the tag color); typing `#` suggests existing tags. The side panel lists tags used by notes; choosing one filters the list. The right panel shows the note's tags. Tags are only changed through the text (no chip editor on notes).
- Tag names allow `/` already (only spaces, `#` and invisible characters are refused in `tagName`). Nested display (`a/b` under `a`) is later.
- Manage tags: `tags.list` adds `noteCount`. Rename and merge rewrite `#old` in note text (same rewrite helper as D8, with undo). Delete is refused while live notes contain the tag (409 `tag_in_notes`, "Remove #x from 3 notes first.") because the text would bring it back on the next save. See Q4.
- Confidence: low to medium.

**D11. Templates (N3).**
- Choice: own table (D3), not notes, so they never show up in links, search or the graph. Side panel row "Templates" opens a list and the same editor (wikilinks and tags are not parsed in templates). Variables replaced when a note is created from a template, on the server in India time: `{{title}}`, `{{date}}` (YYYY-MM-DD), `{{time}}` (HH:mm). Format strings like `{{date:…}}` are later. "New note" gets a menu: Blank note, then the templates. One template can be marked "Use for daily notes".
- Reason: Obsidian's three variables and defaults [S27]; Logseq's single daily default template [S26].
- Confidence: medium.

**D12. Daily notes (N3).**
- Choice: one note per India calendar day, title `YYYY-MM-DD` (Obsidian default [S25]), `daily_date` set, created in no folder. Opening is `notes.openDaily { date? }` (default today in India): it returns the existing note or creates it (from the daily template if one is marked). Ways in: the side panel row "Today" (with the date as a muted hint), the page key **D**, and a "Daily notes" view listing them newest first. If a normal note already has that title, the daily note is titled `YYYY-MM-DD (daily)`.
- Reason: [S25, S26]; India day by the time-and-money rules.
- Confidence: medium.

**D13. Version history (N4).**
- Snapshot rule (server, on a content save): if the note's newest version is older than **10 minutes** (or there is none), first store the content **as it was before this save** (`reason: auto`), unless it is empty or equal to the newest version. So each version is a state the note had at the start of an editing session. Also stored: before a restore (`before_restore`) and before a conflict overwrite (`conflict`).
- Retention: the newest **50 versions per note**; older ones are deleted when a new one is added. Versions go with the note when it is deleted forever.
- Display: the History tab lists versions grouped by India day: time, a reason word when not auto, and "+120 / −8 words". Clicking one shows it read-only in the editor area with a bar: "Version from 13 Oct, 14:32", a "Show changes" switch (line diff against the current text: added lines with a lavender tint and a "+" sign, removed lines struck through in the danger color with a "−" sign, so color is never the only signal), "Restore", "Close".
- Restore: `notes.restoreVersion` stores the current content as `before_restore`, then puts the version's content (title is not changed, so links are not rewritten). Toast "Version restored." with Undo (restores the `before_restore` version).
- Diff: a small line diff in packages/shared (longest common subsequence on lines, fine for notes of a few thousand lines), no library (Q7).
- Reason: Notion records every 10 minutes while editing [S29]; Obsidian keeps snapshots at least 5 minutes apart and has "Show changes" [S28]. A count limit instead of days because the free Supabase database is small and a note you rarely edit should keep its history.
- Confidence: medium.

**D14. Autosave and conflicts.**
- Save about **1 second** after the last change, and at most every **10 seconds** while typing without a pause; save at once when switching notes, when the editor loses focus, when leaving the page (unmount), when the app is hidden, and when the window is closing (`onCloseRequested`, waits for the save, then closes) [S30, S32].
- One save in flight per note; changes made meanwhile are sent in one follow-up save [S30]. Each save sends `baseRevision`; the server updates only if it matches and returns the new `revision` [S31].
- A copy of unsaved markdown is kept in localStorage (`personal-os.notes-draft.<id>` with the base revision) until the server accepts it. On opening a note with a leftover draft: same revision → saved silently; different revision → the conflict bar.
- Conflict (409 `note_conflict`, the body has the server's note): autosave stops and a quiet bar above the editor says "This note was changed on another device." with **Keep mine** (saves over it; the server first stores theirs as a `conflict` version, so nothing is lost) and **Use theirs** (drops your unsaved changes). [S30]
- Status text in the top bar (11, muted): "Saving…", "Saved", "Not saved, retrying" (danger) after a failed save; retries on the next change or after 5 s.
- Content saves show no toast (the editor has its own Ctrl Z). Title rename, move, pin and delete show the usual toasts with Undo.
- Confidence: medium.

**D15. Delete, Trash and folders.**
- Move to Trash = soft delete of the note and its entity (`notes.delete`, Undo toast). Trash view lists them with Restore and "Delete forever" (hard delete, with a confirm; cascades links, tags and versions) and "Empty trash". Auto-empty after 30 days (Notion's period [S29]) needs a scheduled job, which does not exist yet: later.
- A trashed note no longer counts as a link target (its incoming links show unresolved); restoring it re-resolves them (same scan as a create).
- Folders: create, rename, move (into another folder, depth at most 3), delete only when empty ("Move or delete the 3 notes in this folder first."). See Q3.
- Confidence: medium.

**D16. Keyboard (Notes page only, plain keys, never Ctrl; same guards as Tasks: not while typing in a field or the editor, not in menus, dialogs or the palette).**
- N new note, D today's daily note (N3), Up and Down move in the note list, Enter opens the focused note and puts the cursor in the editor, Esc in the editor (with no popup open) moves focus back to the list row, Delete moves the focused note to Trash (Undo toast), ? shortcut help.
- Inside the editor TipTap's own text keys work (section 2: Ctrl B, I, E, Z, Shift Z, Shift S, Shift 7/8/9, Alt 1 to 3, Alt C). They never clash with the app's Ctrl keys: the global registry only acts on Ctrl with no Shift or Alt, and TipTap binds none of Ctrl K, J, comma, 0 to 9 [S3]. Ctrl K in the editor still opens the palette.
- Confidence: medium.

**D17. Search (built before Notes) and Realtime (built before Notes).**
- Search should index for notes: `entities.title` (weight A) and `notes.content_text` (weight B), with the `simple` configuration (decision 42); trashed notes are excluded through `entities.deleted_at`. The N1 hand-written migration adds a trigger on `notes` (insert, and update of `title` or `content_text`) that fills `entities.search_vector`, written like the tasks trigger in the search memo. N1 also adds `'note'` to `SEARCH_TYPES` with a notes provider (snippets from `content_text`, capped at the first 20,000 characters for `ts_headline`). Results open `/notes?note=<id>`. This matches section D13 and the "Notes later" note of `docs/design/research/search.md`.
- Realtime (memo `docs/design/research/realtime.md`): each Notes migration adds its new tables to `REALTIME_TABLES` and to the `supabase_realtime` publication with `GRANT SELECT ... TO authenticated` in the same feature (N1: `notes`, `note_folders`; N3: `note_templates`; `note_versions` is not shown live, so it is left out). When a change for the open note arrives: no unsaved edits → reload quietly; unsaved edits → the conflict bar of D14. Lists are refreshed by invalidating their queries.
- Confidence: medium (the Search and Realtime memos were written in parallel; their final contracts win if they differ).

**D18. Server actions and routes.**
| Action | Permission | Route | Undo | Stage |
|---|---|---|---|---|
| notes.list `{ folderId? \| 'none', tagId?, daily?, trash?, sort, limit, offset }` | read | GET /notes | – | N1 |
| notes.titles | read | GET /notes/titles | – | N2 |
| notes.get `{ id }` | read | GET /notes/:id | – | N1 |
| notes.create `{ title?, folderId?, contentMd?, templateId? }` | write | POST /notes | notes.delete | N1 (templateId N3) |
| notes.update `{ id, baseRevision, contentMd?, folderId?, pinned?, force? }` | write | PATCH /notes/:id | notes.update with old values | N1 |
| notes.rename `{ id, title }` | write | POST /notes/:id/rename | notes.rename back | N1 (link rewrite N2) |
| notes.delete `{ id }` | destructive | DELETE /notes/:id | notes.restore | N1 |
| notes.restore `{ id }` | write | POST /notes/:id/restore | notes.delete | N1 |
| notes.purge `{ id }` / notes.emptyTrash | destructive | DELETE /notes/:id/forever, DELETE /notes/trash | none | N1 |
| noteFolders.list / create / update (name, parentId) / delete / restore | read / write / write / write / write | GET, POST /note-folders, PATCH, DELETE /note-folders/:id | delete ↔ restore | N1 |
| notes.links `{ id }` | read | GET /notes/:id/links | – | N2 |
| notes.openDaily `{ date? }` | write | POST /notes/daily | notes.delete when created, else null | N3 |
| noteTemplates.list / create / update / delete / restore | read / write | /note-templates | delete ↔ restore | N3 |
| notes.versions `{ id }` / notes.getVersion | read | GET /notes/:id/versions, GET /notes/:id/versions/:versionId | – | N4 |
| notes.restoreVersion `{ id, versionId }` | write | POST /notes/:id/restore/:versionId (as in API.md) | notes.restoreVersion of the before_restore version | N4 |
- `notes.update` with `force: true` is "Keep mine" (skips the revision check after storing a `conflict` version). Errors: 409 `note_conflict`, 409 `note_title_taken`, 409 `folder_not_empty`, 400 `folder_too_deep`.
- notes.search, notes.append, notes.summarize and notes.link (docs/features/notes.md) come with the Search feature and Step 3 (AI); not built here.
- Confidence: medium.

**D19. Performance with thousands of notes.**
- The list endpoint never sends `content_md`: only id, title, folder, pinned, daily date, dates and a 140-character excerpt from `content_text`. Default limit 500 with "Show more". Titles for autocomplete come from the small `GET /notes/titles` (id and title only). The editor is its own component, uses `useEditorState` for the save status and word count, and serializes markdown only when saving (not on every key) [S13]. No list virtualization library (not needed at this size; it would be a new library).
- Confidence: medium.

## 4. Data and API outline (shared types, packages/shared/src/notes.ts)
- `NOTE_TITLE_MAX = 200`, `NOTE_CONTENT_MAX = 200_000`, `FOLDER_NAME_MAX = 80`, `FOLDER_DEPTH_MAX = 3`, `NOTE_VERSIONS_KEEP = 50`, `NOTE_SNAPSHOT_GAP_MINUTES = 10`.
- `noteTitle` (trim, 1 to 200, no `[ ] | #`), `noteSummarySchema` `{ id, title, folderId, pinned, dailyDate, excerpt, tagIds, createdAt, updatedAt, deletedAt }`, `noteSchema` = summary + `{ contentMd, revision }`, `noteFolderSchema` `{ id, name, parentId, noteCount }`, `noteLinksSchema` `{ backlinks: [{ noteId, title, context }], outgoing: [{ target, noteId | null }] }`, `noteVersionSummarySchema` `{ id, createdAt, reason, words, wordsDelta }`, `noteTemplateSchema` `{ id, name, contentMd, isDailyDefault }`.
- Pure functions with tests (packages/shared/src/note-text.ts): `unescapeMarkdown`, `markdownToPlainText`, `parseWikilinks`, `rewriteWikilinks(md, oldTitle, newTitle)`, `parseTags`, `rewriteTag(md, old, new)`, `applyTemplate(md, { title, now })`, `lineDiff(a, b)`, `countWords`.
- Write results follow the tasks pattern: `{ item, undo }`; rename also returns `updatedNoteIds`.

## 5. Build stages (each one visible and testable)

### N1. Notes page, folders, editor with autosave, Trash
- **The owner sees:** the Notes page with the side panel (All notes, Folders with a tree, Trash; Today, Tags and Templates show "Soon"), the note list, the editor with title, headings, lists, checklists, quotes, code blocks, links, word count, the save status, pin, move to folder, Trash with restore and delete forever. Notes survive a restart; typing then closing the window keeps the text.
- **Contract (orchestrator, committed first):** migration `notes_and_folders` + `notes_triggers`; `packages/shared/src/notes.ts` and `note-text.ts` (with tests); action definitions for N1; server stubs `actions/notes.ts`, `actions/note-folders.ts`, and hook stubs `actions/note-links.ts` (`rebuildNoteLinks`, `rewriteLinksOnRename`: no-op in N1), `actions/note-tags.ts` (`rebuildNoteTags`: no-op), `actions/note-versions.ts` (`maybeSnapshot`: no-op) that `notes.ts` already calls, so later stages never edit `notes.ts`; desktop `modules/notes/` skeleton: `notes-queries.ts`, `folders-queries.ts`, `query-keys.ts`, `notes-ui-store.ts`, `features.ts`, `shell/notes-layout.tsx` with slots; route files `/_app/notes` (+ search param `note`); `fake-api.ts` routes; TipTap packages installed (D2); the markdown round-trip test file listing the cases.
- **Parallel units (4 agents):** server-dev A: `actions/notes.ts`, `routes/notes.ts` + tests. server-dev B: `actions/note-folders.ts`, `routes/note-folders.ts` + tests. ui-dev A: `modules/notes/shell/**` and `modules/notes/list/**`. ui-dev B: `modules/notes/editor/**` (extensions, markdown round trip, autosave hook, title field, status, conflict bar, close flush). Then the four reviewers.
- **Tests:** shared parsers and round trips (headings, lists, nested lists, checklists, code with `[[` and `#` inside, tables, links, `&`, `<`, `*`, `_`); title rules and uniqueness (case, trash, restore " (2)"); revision conflict 409 and `force`; user scope on every action; folder depth and non-empty delete; trash, restore, purge cascades; autosave timing with fake timers (1 s, 10 s max, flush on note switch, unmount, blur); localStorage draft recovery; keyboard keys and guards; dark and light.
- **Risks:** R1 markdown round-trip losses; R4 testing ProseMirror in jsdom (use editor commands, not typing; mock `getClientRects` if needed); R5 the close flush in the real Tauri window (capability for `onCloseRequested` must be checked by hand); R6 bundle size (check the Notes chunk size in the build output).

### N2. Wikilinks, backlinks, outline, slash menu
- **The owner sees:** typing `[[` suggests notes; links open notes; unresolved links create a note on click; the right panel with Backlinks (with context) and Outgoing links, and Outline; renaming a note updates links in other notes with an Undo toast; the `/` menu inserts blocks and tables.
- **Contract:** `notes.titles`, `notes.links` definitions, route stubs, `GET /notes/titles` and `/notes/:id/links` in the fake API, hook signatures `useNoteTitles`, `useNoteLinks`; `@tiptap/extension-mention`, `@tiptap/suggestion` (+ `@floating-ui/dom` if Q1 is yes).
- **Parallel units (3 agents):** server-dev: `actions/note-links.ts`, `routes/note-links.ts` + tests (rebuild, resolve, rename rewrite, ILIKE re-resolve, backlinks query). ui-dev A: `modules/notes/editor/wikilink/**` and `editor/slash-menu/**`. ui-dev B: `modules/notes/right-panel/**` (panel, Links tab, Outline tab).
- **Tests:** links equal parsed targets after each save; code blocks ignored; self-links skipped; rename rewrites aliases and heading forms and undo restores; a new note picks up earlier unresolved links; trashed sources not in backlinks; suggestion keyboard (arrows, Enter, Esc) and "Create" row; outline jump; round trips of `[[a|b]]`.
- **Risks:** R2 marked's inline tokenizer order (`[[` against the normal link rule; the custom tokenizer must win), R3 wikilink node and IME input (Malayalam typing) near atom nodes.

### N3. Tags in notes, templates, daily notes
- **The owner sees:** `#tags` styled in the text and suggested on `#`; a Tags section in the side panel that filters the list; tags in the right panel; Templates with `{{date}}`, `{{time}}`, `{{title}}`; New note from a template; Today (key D) opens or creates the daily note from the daily template; the Daily notes list.
- **Contract:** migration `note_templates_and_daily`; `notes.openDaily`, `noteTemplates.*` definitions; `tags.list` `noteCount`; fake API; hooks `useNoteTemplates`, `useOpenDaily`.
- **Parallel units (4 agents):** server-dev A: `actions/note-tags.ts`, `actions/tags.ts`, `actions/tag-management.ts`, `routes/tags.ts` + tests. server-dev B: `actions/note-templates.ts`, `actions/note-daily.ts`, `routes/note-templates.ts`, `routes/note-daily.ts` + tests. ui-dev A: `modules/notes/shell/**` (Tags section, Today row), `modules/notes/editor/tags/**`, `modules/notes/right-panel/tags-section.tsx`. ui-dev B: `modules/notes/templates/**`, `modules/notes/daily/**`, `modules/notes/list/new-note-menu.tsx` (stubbed in the contract).
- **Tests:** tag parsing rules (digits only, `\_`, headings, code, URLs with `#`); entity_tags equal the parsed set; tag rename and merge rewrite note text with undo; delete refused while used; template variables in India time near midnight; one daily note per India day (00:10 IST); the title clash case; key D.
- **Risks:** R7 tag rewrite touching text that only looks like a tag (URL fragments): guarded by the "after a space or line start" rule and tests.

### N4. Version history
- **The owner sees:** the History tab with versions by day; a read-only preview; "Show changes"; Restore with an Undo toast; a conflict "Keep mine" leaves their text in History.
- **Contract:** migration `note_versions`; `notes.versions`, `notes.getVersion`, `notes.restoreVersion` definitions; `lineDiff` in shared; fake API; hooks `useNoteVersions`, `useNoteVersion`.
- **Parallel units (2 agents):** server-dev: `actions/note-versions.ts` (fills `maybeSnapshot`), `routes/note-versions.ts` + tests. ui-dev: `modules/notes/history/**`.
- **Tests:** the 10-minute rule with fake time; no empty or duplicate versions; keep 50; restore and its undo; conflict version; versions removed on purge; diff output.
- **Risks:** R8 storage growth (50 full copies of a long note); acceptable for one user, watch the Supabase size.

## 6. Open points and risks
- R1 Markdown losses (D1): guarded by round-trip tests; anything that cannot round-trip is not offered in the editor.
- R2 `[[` tokenizer priority in marked: test first in the N2 contract; fallback is a `findSuggestionMatch` and a pre-pass that protects `[[…]]` before marked runs.
- R3 Composition input (IME) next to atom nodes: test Malayalam and emoji input by hand in WebView2.
- R4 jsdom and ProseMirror: tests use commands; the real typing is checked by hand.
- R5 Window close flush needs the Tauri window permission for close events; check by hand.
- R6 Bundle: the Notes chunk will be roughly 150 to 250 kB gzip (StarterKit 106 kB + markdown and marked + tables + lists; estimate, not measured).
- Unlinked mentions (Obsidian, Bear) are left out of Step 2.

## 7. Questions for the owner (numbered)
1. **Q1. `@floating-ui/dom` 1.x** (latest 1.8.0) is a required peer of `@tiptap/suggestion`, which wikilinks, the slash menu and `#` suggestions use (N2, N3). May it be installed? Recommendation: yes; without it the suggestion package does not load.
2. **Q2. Version pin.** I chose TipTap 3.31.4 over 3.32.0 (released today). Fine?
3. **Q3. Deleting a folder that has notes.** Recommended: refuse until it is empty (simple, nothing hidden). Alternative: move the folder and all its notes to Trash together (Obsidian-like, more code and a bigger undo).
4. **Q4. Deleting a tag that notes use.** Recommended: refuse with the count. Alternative: remove the `#tag` text from those notes too.
5. **Q5. Editor text size.** DESIGN.md body is 13 px. Long writing is easier at 14 or 15 px. Keep 13 (as in the mockup) or allow 14 for the note body only?
6. **Q6. Web links.** Clicking a URL inside a note needs `@tauri-apps/plugin-opener` (new) to open the browser safely. Until then links are not clickable (copy only). Add the plugin in N1, or later?
7. **Q7. Diff.** A small own line diff (my choice) or the `diff` (jsdiff) library?
8. **Q8. Code highlighting (Shiki)** is in ARCHITECTURE.md but in no ROADMAP step. Put it in Step 2b?

## 8. Suggested changes to earlier docs (not applied)
1. docs/DATABASE.md, Notes: replace the column list with D3 (add `content_text`, `revision`, `daily_date`; drop `is_daily`; move `properties`, `aliases`, `favorite`, `archived_at` to "later"); note_folders gets `deleted_at`; note_versions gets `title` and `reason`; note_templates gets `is_daily_default` and `deleted_at`.
2. docs/DESIGN.md section 9: add "Notes page, plain keys: N, D, Enter, Esc, Delete, arrows, ?" and "Inside the note editor, the editor's own text keys (Ctrl B, I, E, Z, Shift Z, Shift S, Shift 7 to 9, Alt 1 to 3, Alt C) work; they never use Ctrl with a plain digit or K, J, comma".
3. docs/DESIGN.md: add a "Notes" component paragraph (list rows, wikilink styles, right panel tabs, version diff colors with + and − signs), and the line "There is no app-level sidebar (Tasks and Notes have inner side panels)".
4. docs/features/notes.md, Actions: list the actions of D18; say that search, append, summarize and link come with Search and Step 3.
5. docs/API.md: add the routes of D18 (`/notes/:id/rename`, `/notes/titles`, `/notes/:id/links`, `/notes/daily`, `/notes/trash`, `/notes/:id/forever`, the versions routes).
6. docs/ROADMAP.md: split the Notes item into N1 to N4; add "Syntax colors in code blocks (Shiki)" to Step 2b if Q8 is yes; add "Unlinked mentions" and "Trash auto-empty after 30 days" as later items.

## 9. Sources (all opened by me unless marked)
- [S1] npm registry, `npm view` for `@tiptap/*` versions, publish times and peer dependencies (run locally, 2026-10-13); package page https://www.npmjs.com/package/@tiptap/react (search result).
- [S2] Tiptap, StarterKit: https://tiptap.dev/docs/editor/extensions/functionality/starterkit
- [S3] Package files on unpkg, version 3.31.4: https://unpkg.com/@tiptap/extensions@3.31.4/dist/index.d.ts, https://unpkg.com/@tiptap/extension-list@3.31.4/dist/index.d.ts, https://unpkg.com/@tiptap/extension-table@3.31.4/dist/index.d.ts, https://unpkg.com/@tiptap/suggestion@3.31.4/dist/index.js, https://unpkg.com/@tiptap/extension-mention@3.31.4/dist/index.js, https://unpkg.com/@tiptap/extension-link@3.31.4/dist/index.js, https://unpkg.com/@tiptap/extension-heading@3.31.4/dist/index.js (and bold, code, code-block, strike, underline)
- [S4] Tiptap, CharacterCount: https://tiptap.dev/docs/editor/extensions/functionality/character-count
- [S5] Tiptap, Markdown basic usage: https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage and installation: https://tiptap.dev/docs/editor/markdown/getting-started/installation
- [S6] Tiptap, Markdown overview: https://tiptap.dev/docs/editor/markdown
- [S7] Tiptap blog, Introducing bidirectional Markdown support: https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap
- [S8] Tiptap, Create an emoji inline node with Markdown: https://tiptap.dev/docs/editor/markdown/guides/create-a-emoji-inline-block
- [S9] `@tiptap/markdown` 3.31.4 source (`escapeMarkdownSyntax`, `encodeTextForMarkdown`): https://unpkg.com/@tiptap/markdown@3.31.4/dist/index.js and `@tiptap/core` 3.31.4 (`encodeHtmlEntities`): https://unpkg.com/@tiptap/core@3.31.4/dist/index.js
- [S10] Tiptap, Mention: https://tiptap.dev/docs/editor/extensions/nodes/mention
- [S11] Tiptap, Suggestion utility: https://tiptap.dev/docs/editor/api/utilities/suggestion
- [S12] Tiptap source, findSuggestionMatch.ts: https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/suggestion/src/findSuggestionMatch.ts
- [S13] Tiptap, Performance guide: https://tiptap.dev/docs/guides/performance
- [S14] Tiptap, Output JSON and HTML: https://tiptap.dev/docs/guides/output-json-html
- [S15] Bundlephobia API: https://bundlephobia.com/api/size?package=@tiptap/starter-kit@3.31.4 (also @tiptap/markdown, @tiptap/react)
- [S16] Bear, Hide the Sidebar and Note list: https://bear.app/faq/hide-the-sidebar-and-note-list-on-mac-and-ipad/
- [S17] Bear, How to use tags: https://bear.app/faq/how-to-use-tags-in-bear/
- [S18] Obsidian Help, Tags: https://obsidian.md/help/tags
- [S19] Apple Support, Create and edit notes on Mac: https://support.apple.com/guide/notes/create-and-edit-notes-not9474646a9/mac
- [S20] Obsidian Help, Internal links: https://obsidian.md/help/links
- [S21] Bear, Info panel, Table of contents and Backlinks: https://bear.app/faq/how-to-use-the-info-panel-table-of-contents-and-backlinks-in-bear/
- [S22] Obsidian Help, Backlinks: https://obsidian.md/help/plugins/backlinks
- [S23] Obsidian Help, Outgoing links: https://obsidian.md/help/plugins/outgoing-links
- [S24] Obsidian Help, Outline: https://obsidian.md/help/plugins/outline
- [S25] Obsidian Help, Daily notes: https://obsidian.md/help/plugins/daily-notes
- [S26] Logseq blog, Automated daily template: https://blog.logseq.com/how-to-set-up-an-automated-daily-template-in-logseq/
- [S27] Obsidian Help, Templates: https://obsidian.md/help/plugins/templates
- [S28] Obsidian Help, File recovery: https://obsidian.md/help/plugins/file-recovery
- [S29] Notion Help, Duplicate, delete and restore content (page history, Trash): https://www.notion.com/help/duplicate-delete-and-restore-content
- [S30] Keera-Labs keera-agent PR 328, editor autosave (debounce, flush, conflict): https://github.com/Keera-Labs/keera-agent/pull/328
- [S31] Wikipedia, Optimistic concurrency control: https://en.wikipedia.org/wiki/Optimistic_concurrency_control
- [S32] Tauri v2, window API (`onCloseRequested`): https://v2.tauri.app/reference/javascript/api/namespacewindow/

Not verified (search summaries only): the Tiptap 3.0 stable date (July 2025); the Tiptap guide page on markdown hooks; Dribbble shots named in section 2; Apple Notes folder rules; the Logseq docs page (too large to load).
Not viewed: any Dribbble, Behance or Mobbin screenshots (no connected browser; Dribbble text was empty, Behance 403).
