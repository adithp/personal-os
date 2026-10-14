# Notes and knowledge

## Purpose
An Obsidian-style knowledge base.

## Screens
- Folder tree and note list.
- Editor (TipTap) with a raw markdown mode (CodeMirror 6).
- Right panel: backlinks, outgoing links, tags, properties, local graph.
- Daily note, templates, version history.

## Editor features
Markdown, rich text, headings, lists, checklists, tables, code blocks (Shiki), math (KaTeX), callouts, images, files, embeds, links, attachments (Supabase Storage), drag and drop.

## Knowledge features
Internal links, wikilinks [[ ]], bidirectional links, backlinks, tags, nested folders, properties, metadata, templates, daily notes, aliases, favorites, pinned, archived, version history, full-text search, advanced filtering.

## Actions
notes.search, notes.get, notes.create, notes.update, notes.append, notes.summarize, notes.link

## AI
Summarize, rewrite, improve, extract key points, suggest tags and links, find related and duplicate notes, generate outlines, create notes from conversations, convert notes into tasks or projects, answer questions from my notes, find relationships.

## Done when
I write all my notes here and the AI answers "Show me everything I wrote about my cybersecurity projects."

## Stage N1: the Notes page (desktop foundation)
The research memo with all decisions is `docs/design/research/notes.md`. This section describes what the desktop has for stage N1 (the editor is described in "The editor" below).

### Screens
- **Three columns** on `/notes`: the inner side panel (224 px, collapsible to 56 px with tooltips), the note list (272 px glass card), and the editor (the rest). The right panel (links, outline) comes in N2.
- **Side panel:** All notes, Today, Folders (header with a + button, a tree up to three levels with fold chevrons and note counts), Tags, Templates, Trash (Today, Tags and Templates are built in stage N3, see below).
- **Folders:** + creates a folder (a name box in the tree: Enter saves, Esc cancels, leaving saves). A folder's more menu has New subfolder (not at the third level), Rename, Move to… (only places that keep the tree within three levels), and Delete folder (Undo toast; the server refuses while it holds notes or folders and its message is shown).
- **Note list:** header with the place name and the count, "?" (shortcut help), Sort (Last edited, Title, Created) and New note; a "Filter notes" box (filters the loaded titles on this device); rows with a small pin, the title, and one muted line with the date and the start of the text (clock time today, Yesterday, or "13 Oct", in India time). Pinned notes come first. Each row has a more menu (also on right click): Pin or Unpin, Move to…, Move to trash. "Show more" appears when the first 500 notes are loaded.
- **Trash:** rows show "Deleted <date>" with Restore and Delete forever (a confirmation dialog), and the header has Empty trash (confirmation). A restored note whose title is taken gets " (2)" from the server.
- **States:** loading line, an error with the server's message and Try again, and short empty messages (no notes, empty folder, empty Trash, no match for the filter).
- **Editor slot:** shows `NoteEditorPane` for the open note (a new editor is created per note, so leaving a note unmounts it and it saves) or "No note open".

### The link (URL)
`/notes?note=<id>&folder=<id|trash|templates|tag:<id>>`. `note` is the open note; `folder` is a folder id, `trash`, `templates` or `tag:<tag id>` (left out for All notes). Bad values are dropped. The search results open `/notes?note=<id>`.

### Keyboard (Notes page only; plain keys, never with Ctrl, Alt or Meta; ignored while typing in a field or the editor, in a menu or dialog, and while the command palette is open)
N new note (in the folder being shown), Up and Down between notes, Enter opens the focused note and puts the cursor in the editor body, Delete moves the focused note to Trash, Esc inside the editor (with no popup open) puts the focus back on the note's row, ? shows the shortcut help. In Trash, Enter restores and Delete asks to delete forever. One list row is the Tab stop (arrows move between rows).

### The editor (stage N1)
- Extensions (`editor/extensions.ts`): TipTap with StarterKit (headings 1 to 3 only, underline off, link autolink on and no open on click), nested task lists, tables (they keep their content but there is no insert button), the placeholder "Start writing…" and a word count. The text is stored as Markdown (`contentMd`, @tiptap/markdown with gfm). Underline, images and raw HTML are dropped on save; a bare URL becomes a link; a loose list becomes tight. Wikilinks, the raw Markdown mode, math and code colors are not built yet.
- Title field: up to 200 characters, placeholder "Untitled"; typing removes `[ ] | #`. It renames on blur or Enter (Enter then moves into the body); Esc restores the saved title; an empty or unchanged title is not sent. 409 `note_title_taken` shows "A note with this title exists."; pending text is saved before a rename.
- Autosave (`editor/use-autosave.ts`): saves 1 s after the last change and at most 10 s after the first unsaved change; at once on blur, when the window is hidden, when the note changes or the editor goes away, and when the window is closed (waits at most 3 s, Tauri only). One save runs at a time; changes made meanwhile go out in one follow-up save. A failed save shows "Not saved, retrying" and retries after 5 s. Status text: "Saved", "Saving…", "Not saved, retrying".
- Drafts: unsent text is kept in localStorage under `personal-os.notes-draft.<noteId>` (the Markdown and the base revision) until the server accepts it. Opening a note with a draft puts it in the editor and saves it when its base revision equals the note's revision; otherwise the conflict bar shows. Drafts are not encrypted.
- Conflict: a 409 `note_conflict` shows "This note was changed on another device." with "Keep mine" (saves with `force: true`) and "Use theirs" (reloads the note and drops the draft); autosave stops while the bar is shown.
- Footer: "N words · Edited just now / N min ago / N h ago / 13 Oct" (India time, refreshed every 30 s). Loading says "Loading note…"; a load error says the server message or "Could not load this note." with Try again.

### Saved on this device (`personal-os.notes-ui`)
The last place (so opening Notes with no link returns to it), the sort, whether the side panel is collapsed, whether the right panel is open, and the folded folders. Unsent note text is also kept per note in `personal-os.notes-draft.<noteId>` (see The editor). The filter text and the open note are not saved.

### Data hooks (`modules/notes/`)
- Keys: `NOTES_KEY = ['notes']` (lists and single notes), `NOTE_FOLDERS_KEY = ['note-folders']` (`query-keys.ts`). Realtime: `notes` and `note_folders` events refresh both (`realtime-keys.ts`, registered in `realtime/registry.ts`).
- `notes-queries.ts`: `useNotes(filters)`, `useNote(id)`, and the writes `useCreateNote`, `useUpdateNote`, `useRenameNote`, `useDeleteNote`, `useRestoreNote`, `usePurgeNote`, `useEmptyTrash`, `usePinNote`, `useMoveNote`. A write resolves to the note the server answered with (`revision` is the next `baseRevision`).
  - `useUpdateNote` (content saves) never patches the cache before the server answers, shows no toast, and throws the `ApiError` (`note_conflict` 409) to the caller. On success the saved note replaces the cached copy.
  - `useRenameNote` throws `note_title_taken` 409 without a toast (the title field shows "A note with this title exists."); other errors show a toast; success shows "Renamed." with Undo.
  - Delete, restore, purge and pin change the cached lists at once and roll back on error; delete, restore, pin and move show an Undo toast (the undo goes through `POST /undo`). Pin and move read the note's `revision` first (the lists have none) and do not change it.
- `folders-queries.ts`: `useNoteFolders()` and `useFolderActions()` (`create`, `rename`, `move`, `remove`, `restore`).
- The mock API (`src/test/fake-notes.ts`, wired into `fake-api.ts`) follows the rules above: unique titles ignoring case (409 `note_title_taken`), title characters, revision check (409 `note_conflict`, skipped with `force`), Trash, restore with " (2)", purge only from Trash, folders with unique names per parent, depth 3, delete only when empty, and the undo descriptors.

### Routes the desktop expects
`GET /notes`, `GET/PATCH/DELETE /notes/:id`, `POST /notes`, `POST /notes/:id/rename`, `POST /notes/:id/restore`, `DELETE /notes/:id/forever`, `DELETE /notes/trash`, `GET/POST /note-folders`, `PATCH/DELETE /note-folders/:id`, `POST /note-folders/:id/restore`, `POST /undo`.

## Stage N2: links, backlinks, outline, slash menu
- **Wikilinks:** `[[Note title]]`, `[[Note title|shown text]]` and `[[Note#Heading]]` (the heading is kept in the text and the link opens the note). In the editor a link is an inline atom node: a peach underline when a live note has that title, a dashed muted underline when none has. Typing `[[` opens a glass menu with matching note titles (arrow keys, Enter, Esc; `]`, `[` or `|` close it); the last row is Create "typed text" (hidden when that exact title exists). Typing a whole `[[x]]` by hand turns it into a link. Clicking a link opens that note; clicking a dashed link creates the note with that title in the same folder and opens it. Backspace removes a whole link. Known limit: bold around a link is lost (`**[[a]]**` is saved as `[[a]]`). Links inside code stay text.
- **Slash menu:** `/` on an empty line or after a space opens a menu: Heading 1, 2, 3, Bullet list, Numbered list, Checklist, Quote, Code block, Table (3 by 3), Divider, and inside a table Add row, Add column, Delete row, Delete column, Delete table. Words like `/heading`, `/h1`, `/todo` filter it; a space closes it.
- **Server:** every content save rebuilds the note's `mentions` links to equal the live notes its wikilinks resolve to (by title, ignoring case; unresolved targets are not stored; self links are skipped). Renaming a note rewrites `[[Old]]`, `[[Old|x]]` and `[[Old#h]]` (outside code) in every note that links to it or mentions the old title, raises their revision and rebuilds their links; the toast says "Renamed. Updated links in 3 notes." with Undo (which rewrites back). Creating, restoring or trashing a note re-resolves the notes that mention its title. `GET /notes/titles` lists id and title of live notes; `GET /notes/:id/links` returns backlinks (live source notes, with the line around the first link, cut to 160 characters) and outgoing links (`noteId` null when unresolved).
- **Right panel:** a 264 px glass card, closed by default (toggle in the editor top bar, saved on this device), with tabs Links (Backlinks with count and context, Outgoing links; an unresolved one has a Create button) and Outline (H1 to H3 of the saved text; clicking moves the cursor to that heading). Below 1240 px wide, opening the panel shows the side panel collapsed while it is open.
- **Changes from elsewhere:** when the open note changes on the server (another device, the AI) and you have no unsaved edits, the editor reloads quietly; with unsaved edits the conflict bar shows. A rename that rewrites links in other notes does not disturb the note you have open.
- **Rename details:** the rewrite also covers trashed notes (so a restored note reads the new title; they are not listed in the Undo toast count) and is revision-checked: if a note was saved meanwhile it is re-read once, and skipped if it changed again. Code is detected like Markdown does (a fence closes with the same character and at least as many marks; inline code matches runs of the same length). Backlink context is at most 160 characters including the ellipsis. Known limit: a create racing a save of a note that links to the new title can leave that link unstored until the note is saved again.

## Stage N3: tags, templates, daily notes (contract; server and screens still to build)
- **Shared pure functions** (`packages/shared/src/note-text.ts`, tested): `parseTags(md)` (a tag is `#` plus letters, digits, `_`, `-`, `/`; it follows a space or a line start; not in code; `# ` headings, `a#b` and URL fragments are not tags; needs a letter or `_`, so `#1984` and `#2024-05-01` are not tags; `\_` is undone; names over 40 characters are skipped; unique ignoring case, first spelling kept), `rewriteTag(md, old, new)` (whole name, ignoring case, outside code), `applyTemplate(md, { title, now })` (`{{title}}`, `{{date}}` YYYY-MM-DD, `{{time}}` HH:mm, India time, one pass), `indiaDay(now)`.
- **Actions** (`packages/shared/src/notes.ts`): `noteTemplates.list/create/update/delete/restore`, `notes.openDaily { date? }`; `notes.create` takes `templateId`; `notes.list` takes `tagId` and `dailyOnly`; a note summary may carry `tagNames` and `dailyDate`; `tags.list` items may carry `noteCount`. The server answers 501 `not_implemented` for the template and daily actions until they are built (`actions/note-templates.ts`, `actions/note-daily.ts`); `rebuildNoteTags` is still a no-op.
- **Tables:** `notes.daily_date` and `note_templates` (DATABASE.md). Routes: API.md.
- **Desktop, templates and daily notes** (`modules/notes/templates/**`, `daily/**`, `list/new-note-menu.tsx`, `templates-queries.ts`): `useNoteTemplates()` and `useTemplateActions()` (`create`, `update`, `remove` with an Undo toast, `restore`; a 409 `template_name_taken` is thrown without a toast so the name field can show "A template with this name exists."). `TemplatesView` (no props) is a template list (name, a "Daily" marker, New template) next to an editor with the name field (Enter or blur saves, Esc puts the old name back), the "Use for daily notes" switch (the server clears the flag on the others), Delete template, and the text editor. The text editor is the note editor's extensions without the wikilink node, so `[[x]]` stays plain text; it saves 0.8 s after the last change, on blur and on leaving, and shows "Saved" or "Saving…" (not announced) or, on a failed save, a red button "Could not save. Try again" (role alert) that saves again; New template is disabled while the list loads or failed, and after a delete focus moves to the next row or New template; a hint line reads "Variables: {{title}}, {{date}}, {{time}}". `useOpenDaily()` returns `{ open(date?), isPending }`: it posts `/notes/daily`, refreshes the note lists and opens the note with `useNotesNav().openNote`; a failure shows a toast. `DailyList` lists `useNotes({ dailyOnly: true })`. `NewNoteMenu` (the "New note" button of the list header) creates a blank note at once while there are no templates, otherwise it opens a menu: Blank note, then each template (`templateId` is sent; the server fills the variables). Realtime: `note_templates` refreshes `['note-templates']`. The mock API (`test/fake-note-templates.ts`, wired in `fake-api.ts`) follows the template, daily and `templateId` rules.
- **Desktop, tags and shell (part A):**
  - **Side panel:** All notes, Today (a button with the India date as a muted hint, for example "7 Oct"; calls `useOpenDaily().open()` from `daily/use-open-daily.ts`; it is `aria-disabled` while the request runs, so focus stays), Daily notes (place `daily`: `DailyList` with `useNotes({ dailyOnly: true, limit: 366 })` in place of the note list, editor to its right), Folders, a Tags section, Templates (a place that shows `TemplatesView` from `templates/templates-view.tsx` in the main area instead of the list, the editor and the right panel), Trash. Tag rows, template rows and daily rows have one Tab stop each (Up and Down move). Collapsed, Today, Daily notes and Templates are icon rows with tooltips and Tags is one icon button that expands the panel. The "Soon" rows are gone; `features.ts` flags are all on.
  - **Tags section:** the tags with `noteCount` above 0 (from `tags.list`, shared with the Tasks tags hook), sorted by name, each with a color dot, the name and the count. Choosing one filters the list (`GET /notes?tagId=`); the list header shows `#name`; New note in a tag view makes a note in no folder. A tag that no longer exists in a link falls back to All notes. An empty section says "Type #tag in a note to add one."
  - **The link:** `folder` may also be `templates` or `tag:<tag id>`. These are places like `trash` (saved as the last place, `isFolderPlace` is false for them).
  - **`#tag` in the editor** (`editor/tags/note-tags.ts`): the text stays plain; a decoration draws each tag as a chip (radius 6, dark text on the tag color, the Notes peach while the tag does not exist yet). It follows the server rule (after a space or line start, not in code, needs a letter or `_`, up to 40 characters); the colors come from `tags.list` through a bridge in `note-editor-pane.tsx`. Typing `#` opens the suggestion menu (built on `slash-menu/suggestion-menu.ts`) with up to 8 existing tags, names that start with the typed text first; Enter or a click writes `#name ` and the menu closes on a character that cannot be in a tag, a space, or Esc. Not offered in code.
  - **Right panel:** the Links tab ends with a Tags section for the open note (`right-panel/tags-section.tsx`): `parseTags` of the saved text, each row filters the list; a tag the server has not created yet is shown muted and does nothing.
  - **Key D** opens today's daily note (same guards as N; also listed in the shortcut help). It only works where the list is shown (not in Templates).
  - **Data:** every note save and write refresh also invalidates the tags list (`TAGS_KEY`) so counts follow. Manage tags (Tasks) shows "2 tasks · 3 notes" when `noteCount` is present.
  - **Mock API:** saving a note finds or creates a tag for each `#tag` (case-insensitive); summaries carry `tagNames`; `GET /notes?tagId=` filters; `GET /tags` carries `noteCount`.
- **Server rules (review fixes):**
  - `isNoteTagName(name)` (note-text.ts, also used by the parser) says whether `#name` reads as a tag. `tags.update` (rename) and `tags.merge` answer 409 `tag_not_note_safe` when any note (trashed too) carries the tag and the new/target name is not readable ("This tag is used in notes, so its name can only have letters, numbers, _, - and /.").
  - `notes.openDaily` fills `{{date}}` with the note's day and `{{time}}` with the current India time (`applyTemplate` takes an optional `date`); creating it retries once on a tag-creation race.
  - `notes.restore` runs under the notes queue and rebuilds the note's tags from its text. If its `dailyDate` is now used by another live daily note, it comes back as a normal note (`dailyDate` cleared, title kept); the Undo of a delete does the same.
  - `notes.create` with `templateId` answers 400 `validation_error` ("The template is too long for a note") when the filled text exceeds 200,000 characters.
