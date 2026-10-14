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
The research memo with all decisions is `docs/design/research/notes.md`. This section describes what the desktop has for stage N1 (the editor itself is described by its own agent in `modules/notes/editor/`).

### Screens
- **Three columns** on `/notes`: the inner side panel (224 px, collapsible to 56 px with tooltips), the note list (272 px glass card), and the editor (the rest). The right panel (links, outline) comes in N2.
- **Side panel:** All notes, Today (Soon, N3), Folders (header with a + button, a tree up to three levels with fold chevrons and note counts), Tags (Soon, N3), Templates (Soon, N3), Trash. `modules/notes/features.ts` turns a Soon row off when its stage is merged.
- **Folders:** + creates a folder (a name box in the tree: Enter saves, Esc cancels, leaving saves). A folder's more menu has New subfolder (not at the third level), Rename, Move to… (only places that keep the tree within three levels), and Delete folder (Undo toast; the server refuses while it holds notes or folders and its message is shown).
- **Note list:** header with the place name and the count, "?" (shortcut help), Sort (Last edited, Title, Created) and New note; a "Filter notes" box (filters the loaded titles on this device); rows with a small pin, the title, and one muted line with the date and the start of the text (clock time today, Yesterday, or "13 Oct", in India time). Pinned notes come first. Each row has a more menu (also on right click): Pin or Unpin, Move to…, Move to Trash. "Show more" appears when the first 500 notes are loaded.
- **Trash:** rows show "Deleted <date>" with Restore and Delete forever (a confirmation dialog), and the header has Empty trash (confirmation). A restored note whose title is taken gets " (2)" from the server.
- **States:** loading line, an error with the server's message and Try again, and short empty messages (no notes, empty folder, empty Trash, no match for the filter).
- **Editor slot:** shows `NoteEditorPane` for the open note (a new editor is created per note, so leaving a note unmounts it and it saves) or "No note open".

### The link (URL)
`/notes?note=<id>&folder=<id|trash>`. `note` is the open note; `folder` is a folder id or `trash` (left out for All notes). Bad values are dropped. The search results open `/notes?note=<id>`.

### Keyboard (Notes page only; plain keys, never with Ctrl, Alt or Meta; ignored while typing in a field or the editor, in a menu or dialog, and while the command palette is open)
N new note (in the folder being shown), Up and Down between notes, Enter opens the focused note and puts the cursor in the editor body, Delete moves the focused note to Trash, Esc inside the editor (with no popup open) puts the focus back on the note's row, ? shows the shortcut help. In Trash, Enter restores and Delete asks to delete forever. One list row is the Tab stop (arrows move between rows).

### Saved on this device (`personal-os.notes-ui`)
The last place (so opening Notes with no link returns to it), the sort, whether the side panel is collapsed, whether the right panel is open, and the folded folders. The filter text and the open note are not saved.

### Data hooks (`modules/notes/`)
- Keys: `NOTES_KEY = ['notes']` (lists and single notes), `NOTE_FOLDERS_KEY = ['note-folders']` (`query-keys.ts`). Realtime: `notes` and `note_folders` events refresh both (`realtime-keys.ts`, registered in `realtime/registry.ts`).
- `notes-queries.ts`: `useNotes(filters)`, `useNote(id)`, and the writes `useCreateNote`, `useUpdateNote`, `useRenameNote`, `useDeleteNote`, `useRestoreNote`, `usePurgeNote`, `useEmptyTrash`, `usePinNote`, `useMoveNote`. A write resolves to the note the server answered with (`revision` is the next `baseRevision`).
  - `useUpdateNote` (content saves) never patches the cache before the server answers, shows no toast, and throws the `ApiError` (`note_conflict` 409) to the caller. On success the saved note replaces the cached copy.
  - `useRenameNote` throws `note_title_taken` 409 without a toast (the title field shows "A note with this title exists."); other errors show a toast; success shows "Renamed." with Undo.
  - Delete, restore, purge and pin change the cached lists at once and roll back on error; delete, restore, pin and move show an Undo toast (the undo goes through `POST /undo`). Pin and move read the note's `revision` first (the lists have none) and do not change it.
- `folders-queries.ts`: `useNoteFolders()` and `useFolderActions()` (`create`, `rename`, `move`, `remove`, `restore`).
- The mock API (`src/test/fake-notes.ts`, wired into `fake-api.ts`) follows the rules above: unique titles ignoring case (409 `note_title_taken`), title characters, revision check (409 `note_conflict`, skipped with `force`), Trash, restore with " (2)", purge only from Trash, folders with unique names per parent, depth 3, delete only when empty, and the undo descriptors.

### Routes the desktop expects
`GET /notes`, `GET/PATCH/DELETE /notes/:id`, `POST /notes`, `POST /notes/:id/rename`, `POST /notes/:id/restore`, `DELETE /notes/:id/forever`, `DELETE /notes/trash`, `GET/POST /note-folders`, `PATCH/DELETE /note-folders/:id`, `POST /note-folders/:id/restore`, `POST /undo`. (`POST /notes/:id/restore` and `POST /note-folders/:id/restore` are not in the route stub yet.)
