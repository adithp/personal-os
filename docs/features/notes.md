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
- **Side panel:** All notes, Today (Soon, N3), Folders (header with a + button, a tree up to three levels with fold chevrons and note counts), Tags (Soon, N3), Templates (Soon, N3), Trash. `modules/notes/features.ts` turns a Soon row off when its stage is merged.
- **Folders:** + creates a folder (a name box in the tree: Enter saves, Esc cancels, leaving saves). A folder's more menu has New subfolder (not at the third level), Rename, Move to… (only places that keep the tree within three levels), and Delete folder (Undo toast; the server refuses while it holds notes or folders and its message is shown).
- **Note list:** header with the place name and the count, "?" (shortcut help), Sort (Last edited, Title, Created) and New note; a "Filter notes" box (filters the loaded titles on this device); rows with a small pin, the title, and one muted line with the date and the start of the text (clock time today, Yesterday, or "13 Oct", in India time). Pinned notes come first. Each row has a more menu (also on right click): Pin or Unpin, Move to…, Move to trash. "Show more" appears when the first 500 notes are loaded.
- **Trash:** rows show "Deleted <date>" with Restore and Delete forever (a confirmation dialog), and the header has Empty trash (confirmation). A restored note whose title is taken gets " (2)" from the server.
- **States:** loading line, an error with the server's message and Try again, and short empty messages (no notes, empty folder, empty Trash, no match for the filter).
- **Editor slot:** shows `NoteEditorPane` for the open note (a new editor is created per note, so leaving a note unmounts it and it saves) or "No note open".

### The link (URL)
`/notes?note=<id>&folder=<id|trash>`. `note` is the open note; `folder` is a folder id or `trash` (left out for All notes). Bad values are dropped. The search results open `/notes?note=<id>`.

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

