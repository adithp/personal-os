# Full-text search (keyword mode): research and decision memo

Written 2026-10-13 by the research agent (decisions 58 and 62: autonomous loop). The owner reviews this later. Every decision lists its sources, the options that were rejected, and a confidence level, so a wrong guess is easy to find and change.

Already fixed before this memo (not redone here): docs/features/search.md (Ctrl K or the dashboard search bar opens it; one palette that also runs commands; results grouped by module with module colors; keyword search under a second), decision 42 (the Postgres `simple` text-search configuration with prefix matching), docs/DATABASE.md section 4 (`entities.search_vector` with a GIN index, filled by a trigger from the title and the module text when search arrives), docs/DESIGN.md section 9 (the command palette look). Natural language and embeddings are Step 3; Gmail and Drive are Step 4.

Mockup: `docs/design/mockups/search.html` (open it in a browser; type in it, use the arrow keys and Enter; buttons at the top switch dark and light, a slow network and a server error).

---

## 1. Sources

### Opened and read (the facts in this memo come from these)
| # | Source | What it gave |
|---|---|---|
| S1 | https://www.postgresql.org/docs/current/textsearch-controls.html | `to_tsquery` raises syntax errors on bad input and supports `:*` prefixes; `plainto_tsquery` and `websearch_to_tsquery` never raise errors but do **not** support prefixes; `ts_rank` vs `ts_rank_cd` (cover density needs positions), normalization bits (1 = divide by 1 + log of length); `ts_headline` options (MaxWords 35, MinWords 15, ShortWord 3, MaxFragments) and the warning that it "uses the original document, not a tsvector summary, so it can be slow"; its output is not safe HTML |
| S2 | https://www.postgresql.org/docs/current/textsearch-tables.html | Expression index vs stored generated column (generated is faster, costs disk); the two-argument `to_tsvector(config, text)` is required in indexes; GIN is the index for text search |
| S3 | https://pglite.dev/extensions/ | PGlite ships `pg_trgm` and `unaccent` as contrib extensions (`@electric-sql/pglite/contrib/...`), pgvector as a separate package |
| S4 | https://supabase.com/docs/guides/database/full-text-search | Supabase recommends a stored tsvector column with a GIN index, prefix search with `:*`, `setweight` for title above body, `websearch_to_tsquery` for Google-style input |
| S5 | https://supabase.com/docs/guides/database/extensions | Supabase has 50+ extensions, enabled with `create extension ... with schema extensions` or the dashboard (the page does not list them by name) |
| S6 | https://supabase.com/blog/postgres-full-text-search-vs-the-rest | Postgres FTS is "good enough" for simple apps; no typo tolerance; pg_trgm is the usual companion |
| S7 | https://www.postgresql.org/docs/current/pgtrgm.html | `similarity`, `%` (threshold 0.3), `word_similarity` (0.6), GIN `gin_trgm_ops` speeds up LIKE and ILIKE anywhere in the text |
| S8 | https://www.postgresql.org/docs/current/unaccent.html | unaccent works as a dictionary inside a copied text-search configuration |
| S9 | https://gist.github.com/Pigeo/058aafeb3c53d68dcd6ba4cab68e7421 | A community function adding `:*` to websearch syntax, with fallbacks "that guarantees that this function will never fail": proof that prefix plus user input needs care |
| S10 | cmdk 1.1.1 README (the installed copy in node_modules, and https://github.com/pacocoursey/cmdk) | `shouldFilter={false}` to filter and sort yourself ("Better memory usage and performance"); `Command.Loading` for async items; `Command.Empty` shows when nothing renders; groups hide when empty |
| S11 | https://code.visualstudio.com/docs/getstarted/userinterface | VS Code: Quick Open (files, recent files when empty) and Command Palette are two modes switched with the `>` prefix |
| S12 | https://obsidian.md/help/plugins/quick-switcher | Obsidian: recent notes when the field is empty; fuzzy letters-in-order; Enter opens, or creates a note when nothing matches |
| S13 | https://www.setproduct.com/blog/command-palette-ui-design-guide | 8 palette states (empty with recents, typing, no results with a way out, loading with fixed-height rows, error that keeps local commands working, nested page, multi-select, disabled); "debounce 150-250 ms for async sources with request cancellation"; width 560-680 px; 6-8 visible rows; focus stays in the input (`aria-activedescendant`) |
| S14 | https://uxpatterns.dev/patterns/advanced/command-palette | Plan loading, empty and error states up front; announce state changes in a live region; keyboard-only completion |
| S15 | https://www.saasui.design/blog/saas-search-command-palette-ux-patterns | Grouped, typed results with consistent icons; each row needs "title, type, and a secondary detail"; recents on an empty palette |
| S16 | https://linear.app/docs/search | Linear search shows recent searches and recent issues when opened; sorts open issues first, then completed, then archived; searches titles, descriptions and comments |
| S17 | https://www.notion.com/help/search | Notion shows recently visited pages first; Best Matches puts title matches above content matches and recently edited pages higher |
| S18 | https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ | One shortcut everywhere, everything in one place, forgiving matching, show the shortcut beside a command to teach it |
| S19 | https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ | Combobox with listbox: DOM focus stays on the input, `aria-activedescendant` moves; Up and Down move, Enter accepts, Escape closes |
| S20 | https://www.nngroup.com/articles/response-times-3-important-limits/ | 0.1 s feels instant, 1 s keeps the flow of thought, 10 s keeps attention |
| S21 | https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation | Each query function gets an AbortSignal; it aborts when the query becomes out of date if the function uses it |
| S22 | https://tanstack.com/query/latest/docs/framework/react/guides/placeholder-query-data | `placeholderData` with the previous data keeps old results on screen while a new key loads (`isPlaceholderData`) |
| S23 | https://caddyserver.com/docs/caddyfile/directives/log | Caddy's access log records `request>uri` with the query string; a `query` filter can delete or hash parameters |

### Own experiments (run on this machine, nothing saved)
| # | What | Result |
|---|---|---|
| E1 | PGlite 0.5.8 from packages/db (`select version()`) | PostgreSQL **18.3**. tsvector, generated tsvector columns, GIN indexes, `setweight`, `ts_rank`, `ts_rank_cd`, `ts_headline`, `unnest(tsvector)` and plpgsql triggers all work, so every part of this design can be tested in our PGlite tests |
| E2 | The safe prefix query (section 4) on hostile input: `foo & ( :* !`, `o'reilly`, `C++`, empty, spaces, Tamil, Malayalam, CJK | Never raised an error. Empty input gives an empty query (no lexemes). **A NUL byte (`\u0000`) makes Postgres fail**, so the input schema must strip control characters. `to_tsquery('simple', 'foo & (')` fails, as S1 says |
| E3 | `simple` on mixed text | Lowercases, keeps accents (`électricité`), splits `invoice-42` into `invoice` and `-42`, `e-mail` into `e-mail`, `e`, `mail`; Malayalam and Tamil words are kept whole; Japanese without spaces is one token |
| E4 | Ranking on 5 sample tasks (title weight A, description weight B) | For "rent": `ts_rank(v, q, 1)` puts "Pay rent" first; `ts_rank_cd` puts a task whose description repeats "rent rent rent" first and a description-only match above short titles. Chosen: `ts_rank` with normalization 1 |
| E5 | 20,000 rows, two users, GIN index | The planner uses a Bitmap Index Scan on the GIN index with the prefix query; 10 to 34 ms per query in PGlite (WASM, 32-bit) including ranking of all matches |
| E6 | The planned trigger function with `SET search_path = ''` (like migration 0001) | `to_tsvector('simple', ...)` still resolves; insert and update of title or description refresh `entities.search_vector` |

### Seen only in search-result summaries (not opened; treated as unverified)
- Raycast root search: "Fallback Commands" appear at the bottom when nothing matches (manual.raycast.com pages and alternativeto.net via a search summary; manual.raycast.com/root-search answered 404).
- Debounce advice: 300 ms is the common default but feels slow; typing gaps are 150-200 ms; Atom's fuzzy finder used 50 ms (dev.to, tutorialpedia.org, github.com/atom/fuzzy-finder/issues/156 via a search summary).
- Supabase lists pg_trgm as a built-in extension (search summary of supabase.com/docs/guides/database/extensions; the page itself did not name extensions).
- Stemming and stop words break prefix search (postgresql.org mailing list via a search summary); `simple` avoids both.
- `unaccent()` is STABLE, not IMMUTABLE, so it cannot go straight into a generated column (from memory, **not checked**; not needed by this design).
- cmdk sets `role="combobox"` and `aria-activedescendant` on its input (not stated in the README; the current palette tests should confirm it).

### Could not view
- **Browser tools:** the Chrome extension was disconnected (two tries), so no screenshots were taken of any design page.
- **Dribbble** (tags and search pages returned an empty JavaScript shell), **Behance** (403) and **Mobbin** (403) could not be read as text either. The design patterns below therefore come from product documentation (S11, S12, S16, S17), the palette guides (S13 to S15) and our own design system, not from gallery shots.
- The mockup was checked with local headless Chrome screenshots (empty field dark, "call nai" dark with a snippet, "re" light, a no-result search); `search.html?q=re&theme=light` opens it with text typed. It was not checked in the real Tauri WebView2 window.

---

## 2. What the research says (short)

- **Prefix search on user input needs care.** The safe parsers (`plainto_tsquery`, `websearch_to_tsquery`) cannot add prefixes, and `to_tsquery` breaks on punctuation (S1, S9, E2). The fix is to let Postgres split the text into words itself, then add `:*` to every word (section 4). This never fails (E2).
- **`simple` is right for us** (decision 42): no stemming and no stop words, so prefixes behave predictably, and it handles Malayalam, Tamil and names (E3).
- **Ranking:** title above description through weights A and B (S4, S17). Open items above done and archived ones (S16).
- **Highlighting:** `ts_headline` is slow on big documents and returns HTML-like text that is not safe (S1). We only need a short excerpt for at most 5 rows, and we highlight in the app.
- **Typo tolerance** needs pg_trgm (S6, S7); it is available in Supabase (unverified listing) and PGlite (S3). Not needed for a first version.
- **Palette patterns in real products:**
  (a) two modes switched by a prefix character (VS Code `>`, S11; Linear type-prefixes, S16);
  (b) one list where commands and data results sit together, with fallbacks at the bottom (Raycast, unverified);
  (c) recent items when the field is empty, results as you type (Obsidian S12, Notion S17, Linear S16, VS Code S11).
  **Chosen: (b) with (c)**, the most minimal: one field, no prefixes to learn, command matches first, data groups after, recents when empty. Re-drawn with our tokens (glass-strong panel, 22 px module squares, muted group headers, input-background selection).
- **Speed:** a debounce of 150-250 ms with request cancellation (S13), old results kept on screen while new ones load (S22), and local commands answer instantly (S13 state 5). Under 0.1 s feels instant, under 1 s keeps flow (S20).
- **No results:** never a dead end; say what was searched and how (S13).

---

## 3. Decisions

Confidence: High = sources agree and it fits our docs; Medium = a sound judgment call; Low = a guess the owner should check.

**D1. Where the search text lives: `entities.search_vector`, filled by triggers on each module table.**
- Choice: keep the plan in docs/DATABASE.md section 4. A trigger on `tasks` writes `setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', description), 'B')` into the task's `entities` row. The existing GIN index `entities_search_vector_idx` is used. Notes later add the same kind of trigger on `notes`.
- Reason: the column and index already exist; `entities` is already the one table every item has, so it acts as the search table; a trigger catches every write path (UI, AI, imports, undo) without action code remembering it; tested in PGlite (E6).
- Rejected: a generated column on `tasks` (S2, S4 recommend generated columns, but it would leave `entities.search_vector` unused and redo DATABASE.md section 4; a generated column on `entities` cannot read `tasks.description` from another table); an expression index (queries must repeat the exact expression, and a cross-table expression is impossible); a new separate search table (duplicates `entities`).
- Sources: S2, S4, E1, E6, docs/DATABASE.md section 4. Confidence: **High**.

**D2. What is searched for tasks: title (weight A) and description (weight B). Tags are searched by name, apart from tasks.**
- Choice: the task vector holds title and description only. Tag names are matched in the `tags` table by prefix (case-insensitive) and shown as their own group. A task is not found by the name of its tag (open the tag result instead, which opens My tasks filtered by that tag).
- Reason: putting tag names into the task vector needs more triggers (on `entity_tags` and on tag rename, merge and delete) for little gain; a Tags group is clearer.
- Rejected: tag names in the task vector (weight C); no tag search.
- Confidence: **Medium** (the owner may want "#home rent" to find tasks; see open point 1).

**D3. Which tasks: every live task, including done, archived and subtasks.**
- Choice: `entities.deleted_at is null` and type `task`. Subtasks whose parent is soft-deleted are left out (they are only reachable through the parent, DATABASE.md). Done and archived tasks are shown with a "Done" or "Archived" label and ranked lower (D9).
- Reason: search is how you find old things (S16 searches completed and archived issues too).
- Confidence: **High**.

**D4. The query: every word becomes a prefix, joined by AND, built by Postgres from the parser's own words.**
- Choice (exact SQL, in the helper of D12): `(select coalesce(string_agg(quote_literal(lexeme) || ':*', ' & '), '')::tsquery from unnest(to_tsvector('simple', $text)))`. The text is always a bound parameter. If it has no words, the server returns no results without querying.
- Reason: never raises a syntax error, ignores operator characters, matches how the documents were split (E2, E3); prefix on every word means "pay re" finds "Pay rent" while typing (decision 42).
- Rejected: `websearch_to_tsquery` (no prefixes, S1); prefix only on the last word (Raycast-like, but "pa rent" then fails); `to_tsquery(input || ':*')` (breaks on punctuation, S9); building the query string in TypeScript (its word split would differ from the Postgres parser, for example `invoice-42`).
- No quotes, OR or minus operators in keyword mode (they come back with natural-language mode, Step 3).
- Confidence: **High**.

**D5. Special characters and limits on the text.**
- Choice: the input schema trims, replaces control characters (U+0000 to U+001F and U+007F) with spaces, and allows 1 to 100 characters (400 `validation_error` outside that). The app searches the server only from 2 characters; 1 character filters commands only.
- Reason: a NUL byte crashes the query (E2); 100 characters is far beyond a real title search.
- Confidence: **High** (the numbers 2 and 100 are judgment calls).

**D6. No typo tolerance, no mid-word matches, no accent folding in this version.**
- Choice: keyword mode finds words by their start only. "voice" does not find "invoice"; "42" does not find "invoice-42" (E3); "electricite" does not find "électricité".
- Reason: decision 42 and minimal scope; the no-result state explains the rule (D17). The upgrade path is known: pg_trgm with a GIN `gin_trgm_ops` index on `entities.title` as a fallback when the full-text query finds fewer than the limit (S7; available in PGlite S3 and, unverified, Supabase), or an `unaccent` configuration (S8).
- Rejected now: pg_trgm fallback (a new extension in Supabase that the owner must enable, and a second ranking to blend); ILIKE '%text%' (no index without pg_trgm).
- Confidence: **Medium**.

**D7. The API: `POST /search` with a JSON body, backed by the read action `search.global`.**
- Choice: body `{ q, types?, limit? }`, answer `{ item: { q, groups } }`. The action is named `search.global`, the name already listed in docs/AI_SYSTEM.md section 5, permission `read`, so the AI can use it in Step 3.
- Reason: a GET puts the search text in the URL, and Caddy's access log on the AWS server records the full URI with the query string (S23, infra/Caddyfile). Decision 51 says task titles must not reach logs; search text is often a task title. The server's own logger already drops query strings, Caddy does not.
- Rejected: `GET /search?q=` as in docs/API.md (would need a Caddy `query` log filter, S23, an infra change in a second place that is easy to forget); a Caddy filter plus GET (works, but more moving parts).
- Confidence: **Medium-high** (a conflict with docs/API.md, see Suggested changes).

**D8. The result shape (exact field names, packages/shared/src/search.ts).**
```ts
export const SEARCH_TYPES = ['task', 'tag'] as const;          // in display order; notes add 'note'
export type SearchType = (typeof SEARCH_TYPES)[number];
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_LIMIT_DEFAULT = 5;

export const searchGlobalInput = z.object({
  q: z.string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
    .pipe(z.string().min(1).max(SEARCH_QUERY_MAX)),
  types: z.array(z.enum(SEARCH_TYPES)).min(1).optional(),     // default: all
  limit: z.number().int().min(1).max(20).default(SEARCH_LIMIT_DEFAULT), // per group
});

const hitBase = { id: z.uuid(), title: z.string(), snippet: z.string().nullable() };
export const taskHitSchema = z.object({
  type: z.literal('task'), ...hitBase,
  status: taskStatusSchema, dueAt: z.iso.datetime().nullable(), dueAllDay: z.boolean(),
  archived: z.boolean(), parentTaskId: z.uuid().nullable(),
});
export const tagHitSchema = z.object({ type: z.literal('tag'), ...hitBase, color: z.string() });
export const searchHitSchema = z.discriminatedUnion('type', [taskHitSchema, tagHitSchema]);
export const searchGroupSchema = z.object({ type: z.enum(SEARCH_TYPES), items: z.array(searchHitSchema) });
export const searchResultSchema = z.object({ q: z.string(), groups: z.array(searchGroupSchema) });
// groups: only non-empty ones, in SEARCH_TYPES order. snippet: null unless the match is outside the title.
```
- Reason: a discriminated union keeps each module's extra fields typed; new modules add one schema and one entry in `SEARCH_TYPES`. No rank numbers are sent (the order is the rank).
- Confidence: **High** for the shape, the field names follow the existing Task type.

**D9. Ranking.**
- Choice: in SQL, `ts_rank(search_vector, query, 1)` (frequency, divided by 1 + log of length), then `updated_at desc`. The task provider reads the top `max(limit × 10, 100) per page, up to 4 pages` matches, then in code multiplies the rank of done or archived tasks by 0.5, sorts again, and keeps `limit`. Tags: exact name first, then shorter names, then by name.
- Reason: E4 showed `ts_rank_cd` lets repeated words in a description beat a short exact title; open-first follows Linear (S16) without hiding done work.
- Rejected: `ts_rank_cd` (E4); strict open-first ordering (an exact match on a done task would sink under weak open matches).
- Confidence: **Medium** (tune after real use).

**D10. Highlighting and snippets: the server sends plain text, the app highlights.**
- Choice: the server adds a `snippet` only when the title alone does not match all words and the description does: `ts_headline('simple', description, query, 'StartSel="",StopSel="",MaxWords=14,MinWords=6,ShortWord=0')`, so it is a plain-text excerpt (E1 tested empty selectors). The app marks, in the title and the snippet, the start of every word that begins with one of the typed words (case-insensitive, words are runs of Unicode letters, marks and digits: `/[\p{L}\p{M}\p{N}]+/gu`). The mark is a soft lavender background (`color-mix(in srgb, var(--accent) 30%, transparent)` in dark mode, 50% in light mode where 30% was too faint in the mockup screenshot; radius 4), not bold.
- Reason: no markup crosses the API, so nothing needs sanitising (S1 warns `ts_headline` output is unsafe); `ts_headline` runs on at most 5 short rows, so its cost (S1) does not matter; the app's rule matches the prefix rule of D4. A background keeps DESIGN.md's rule that semibold is for headings only.
- Rejected: `ts_headline` with `<b>` tags (needs sanitising); bold matches (weight rule).
- Confidence: **High**.

**D11. Limits.**
- 5 results per group by default (max 20 for the AI later), so the palette shows at most about 10 data rows plus commands, near the 6-8 visible rows of S13 with scrolling. No "Show more" in this version.
- Confidence: **Medium**.

**D12. Safety: user scope and the helper in src/lib.**
- Every query goes through the user scope (`user_id = <verified user>` is always ANDed). Raw SQL stays in src/lib. Two additions:
  1. **`UserScope.selectFields`** in `apps/server/src/lib/user-scope.ts`, the one missing ability (today `select` returns whole rows only, but search needs computed values such as a rank):
     ```ts
     /** Chosen columns or computed SQL values (for example a search rank) of the user's rows. */
     selectFields: <T extends UserOwnedTable, F extends Record<string, AnyPgColumn | SQL.Aliased>>(
       table: T, fields: F, options?: SelectOptions,
     ) => Promise<Record<keyof F, unknown>[]>;
     // implementation: db.select(fields).from(table).where(where(table, options.where)) + orderBy, limit, offset
     ```
     The guard test (`no-direct-database.test.ts`) adds `selectFields` to the methods that must contain the owner condition, and `user-scope.test.ts` proves another user's rows never come back.
  2. **`apps/server/src/lib/search.ts`** with the only full-text SQL in the server:
     ```ts
     export const SEARCH_CONFIG = 'simple';
     /** The text as a prefix query (D4). Never fails on punctuation. */
     export function prefixQuery(text: string): SQL;
     /** True when the text has at least one word for the query (checked in TypeScript with the same Unicode rule, so empty searches skip the database). */
     export function hasSearchWords(text: string): boolean;
     /** Live entities of one type whose search_vector matches, best first. */
     export function matchEntities(scope: UserScope, input: { text: string; type: EntityType; limit: number }):
       Promise<{ id: string; title: string; rank: number; updatedAt: Date }[]>;
     /** Plain-text excerpts (D10) of one text column for these row ids, only where the title does not match. */
     export function snippets(scope: UserScope, input: { table: UserOwnedTable; titleColumn: AnyPgColumn; textColumn: AnyPgColumn; ids: string[]; text: string }):
       Promise<Map<string, string>>;
     /** lower(column) LIKE lower(prefix) || '%', with %, _ and \ escaped. */
     export function startsWith(column: AnyPgColumn, prefix: string): SQL;
     ```
- Confidence: **High** (exact signatures may change while building; the rule does not).

**D13. How modules join search (server and app).**
- Server: `apps/server/src/actions/search.ts` holds the action and `const SEARCH_PROVIDERS: Record<SearchType, SearchProvider>` with `type SearchProvider = (scope: UserScope, text: string, limit: number) => Promise<SearchHit[]>`. Because it is a `Record` over `SEARCH_TYPES`, adding `'note'` to the shared list fails the type check until a notes provider exists. Providers run in parallel (`Promise.all`); one provider failing fails the request (simpler, and the app's error state handles it).
- App: `apps/desktop/src/commands/search-kinds.tsx` with `const SEARCH_KINDS: Record<SearchType, SearchKind>`, where a kind has `heading` ("Tasks", "Tags"), `module` (for the icon color), `Icon`, `meta(hit, now)` (the right-side text) and `open(hit, navigate)`.
- Notes later (matches D17 of docs/design/research/notes.md, written in parallel): add `'note'` to `SEARCH_TYPES`, a trigger on `notes` (title weight A, the plain-text `notes.content_text` weight B, same `simple` configuration), a provider that reads `matchEntities(type 'note')` plus `snippets` on `content_text` (cap the text passed to `ts_headline`, for example the first 20,000 characters, because S1 warns it reads the whole document), and a kind with the Notes peach color that opens `/notes?note=<id>`. Goals (Feature 8, memo docs/design/research/tasks-goals.md) adds the `goal` entity type, so goals can join the same way later; not in this feature.
- Confidence: **High**.

**D14. The palette: one field, commands first, data groups after.**
- Choice: one input (placeholder "Search or type a command…"). Order when typing: matching commands (Go to, Appearance, Dock, filtered and sorted with the existing `scoreCommand`), then data groups in `SEARCH_TYPES` order: **Tasks**, **Tags**. Group headings stay the muted 11 px text of DESIGN.md; the module color is on the 22 px icon square of each row (Tasks yellow with the checklist icon; a tag row has a neutral square with a 10 px dot in the tag's color).
- Reason: commands are local and appear at once; results arrive later and are added below, so the keyboard selection never jumps under the user's finger (S13: async results must not move the selection). When no command matches (the usual case for a task name), the first result is first anyway. No prefixes to learn (S11 and S16 need them; S18 says one place for everything).
- Rejected: results above commands (selection jumps when results land); separate modes with a `>` prefix (S11, more to learn); mixing commands and results in one ranked list (needs a shared score across local and server items).
- cmdk: `shouldFilter={false}` (S10), the app filters commands itself; every item `value` is unique (`cmd:<id>`, `task:<id>`, `tag:<id>`) so a task named "Open Tasks" cannot clash with a command.
- Confidence: **Medium-high**.

**D15. Rows and Enter.**
- A task row: 22 px Tasks square, title (one line, highlighted), on the right one muted 11 px meta: "Done", "Archived", or the due day ("Today", "Tomorrow", "15 Oct", in India time, overdue in the danger color as on task cards), or "Subtask" when it has a parent and no due date. With a snippet the row is 48 px: title, then the 11 px muted snippet line; otherwise 36 px like command rows.
- Enter on a task: close the palette and open `/tasks/my-tasks?task=<id>` (adding `archived=true` for an archived task so the list shows it); the existing page selects it and opens the detail panel (my-tasks-page.tsx already reads `task` from the URL; the panel loads by id, so subtasks and done tasks open too).
- Enter on a tag: open `/tasks/my-tasks?tag=<id>` (the favorites' URL filter).
- Mouse click does the same. No second action (Ctrl Enter) in this version.
- Footer hint: "↑ ↓ to move · Enter to open · Esc to close".
- Confidence: **High**.

**D16. Typing, debounce and loading.**
- Commands filter on every keystroke. The server is asked 150 ms after typing stops (S13 range 150-250 ms; local and Mumbai servers answer fast), only for 2 or more characters, through TanStack Query with key `['search', q]`, `staleTime` 30 s, `placeholderData` = the previous results (S22), and the AbortSignal passed to fetch so stale requests stop (S21). `ApiClient.request` gets an optional `signal` in `RequestOptions`.
- While new results load, the old rows stay and are dimmed to 60% opacity. If there are no old rows and the answer takes more than 300 ms, one muted row "Searching…" shows under the commands (no spinner, no skeleton for so few rows).
- Data changes elsewhere (a task created or renamed) invalidate `['search']` from the task mutations' existing invalidation, so the next search is fresh.
- Confidence: **Medium** (150 ms and 300 ms are judgment calls).

**D17. Empty, no-result and error states.**
- Empty field: **Recent** (D18, if any), then the commands as today (Go to, Appearance, Dock).
- No results (no command and no data match, after the answer arrived): centered muted text `Nothing found for "abc".` and under it, 11 px: "Search finds tasks and tags by the start of their words." (teaches D6, S13 asks for a way forward).
- Error: the commands still work (S13 state 5); in place of the data groups one quiet row in the danger color: "Search is not available right now." For 503 `schema_behind` it shows the existing "Database update needed: run pnpm db:migrate".
- A visually hidden live region (`role="status"`) says "5 results" or "No results" after each answer (S14).
- Confidence: **High**.

**D18. Recent items: yes, the last 5 opened from the palette, on this device. No recent search texts.**
- Choice: when a data result is opened from the palette, it is put first in a list of at most 5 (`{ type, id, title, color? }`), saved with Zustand persist on this device (like the settings, decision 23). Shown as the first group "Recent" when the field is empty. A stored title can be out of date until the item is opened again; that is accepted.
- Reason: every product checked shows recent items on an empty field (S11, S12, S16, S17, S13, S15).
- Rejected: recent search texts (Linear has them, but a list of old words is noise for one user); recent items from the server (needs a table; later, with Realtime and mobile).
- Confidence: **Medium** (easy to drop).

**D19. The dashboard search bar: no change in behavior.**
- It already opens the palette with the typed text (DESIGN.md section 8, `openWith`); that text now also searches data. Its placeholder "Search or type a command" already fits.
- Confidence: **High**.

**D20. Performance targets and how to test them.**
- Targets: commands filter within one frame; the server action answers in under 150 ms on Supabase for 10,000 tasks; results show within about 400 ms of the last keystroke on the local server (150 ms debounce + request), well inside the 1 s of docs/features/search.md (S20).
- Tests (no timing asserts in Vitest: LESSONS 2026-10-13 says timing tests are flaky): a PGlite test that seeds a few thousand entities, sets `enable_seqscan = off`, and checks that `EXPLAIN` of the search uses `entities_search_vector_idx`; correctness tests for prefixes, punctuation, the NUL byte, Malayalam, two users, deleted tasks, subtasks of a deleted parent, done and archived ranking, the trigger on insert, rename, description edit and the migration backfill. The real speed is measured by hand on Supabase in the feature report (manual step with a timing from the browser DevTools network tab).
- Confidence: **High**.

**D21. Out of scope for this feature.**
Natural language and semantic search (Step 3), Gmail and Drive (Step 4), notes (they join with the Notes feature through D13), typo tolerance and mid-word matches (D6), accent folding, query operators (quotes, OR, minus), "Create task from the search text", a full results page or "Show more", filters by module in the field (`types` exists in the API only), recent search texts, mobile.

---

## 4. SQL outline

### Migration (hand-written, the next free number when the build starts; Goals takes 0008 to 0010, so probably `0011_tasks_search_vector.sql`; made with `pnpm exec drizzle-kit generate --custom --name=tasks_search_vector`, db-change skill)
```sql
-- Fills entities.search_vector for tasks: title weight A, description weight B, the simple
-- configuration (decision 42). Written by hand (drizzle-kit cannot describe functions and triggers).
CREATE OR REPLACE FUNCTION "public"."task_search_vector"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE "public"."entities"
     SET "search_vector" =
           setweight(to_tsvector('simple', coalesce(NEW."title", '')), 'A') ||
           setweight(to_tsvector('simple', coalesce(NEW."description", '')), 'B')
   WHERE "id" = NEW."id" AND "user_id" = NEW."user_id";
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tasks_search_vector_insert"
  AFTER INSERT ON "public"."tasks"
  FOR EACH ROW EXECUTE FUNCTION "public"."task_search_vector"();--> statement-breakpoint
CREATE TRIGGER "tasks_search_vector_update"
  AFTER UPDATE OF "title", "description" ON "public"."tasks"
  FOR EACH ROW
  WHEN (OLD."title" IS DISTINCT FROM NEW."title" OR OLD."description" IS DISTINCT FROM NEW."description")
  EXECUTE FUNCTION "public"."task_search_vector"();--> statement-breakpoint
UPDATE "public"."entities" AS e
   SET "search_vector" =
         setweight(to_tsvector('simple', coalesce(t."title", '')), 'A') ||
         setweight(to_tsvector('simple', coalesce(t."description", '')), 'B')
  FROM "public"."tasks" AS t
 WHERE t."id" = e."id" AND t."user_id" = e."user_id";
```
Notes: the entity row is inserted before the task (foreign key), so the AFTER INSERT trigger finds it. Updating `entities` bumps its `updated_at` through the 0001 trigger; that is correct (the item changed). No schema file changes: `search_vector` and its index exist (packages/db/src/schema/entities.ts); `drizzle-kit generate` must then say "No schema changes".

### The task provider (in TypeScript, through the helpers of D12)
1. `if (!hasSearchWords(text)) return []`.
2. `matchEntities(scope, { text, type: 'task', limit: limit * 4 })` →
   `select id, title, ts_rank(search_vector, Q, 1) as rank, updated_at from entities where user_id = $user and type = 'task' and deleted_at is null and search_vector @@ Q order by rank desc, updated_at desc limit $n` (Q = `prefixQuery(text)`).
3. `scope.select(tasks, { where: and(scope.isLive(tasks), inArray(tasks.id, ids)) })`; load the parents of subtasks and drop subtasks whose parent is deleted.
4. Rank × 0.5 for done or archived, sort, keep `limit`.
5. `snippets(scope, { table: tasks, titleColumn: tasks.title, textColumn: tasks.description, ids, text })` →
   `select id, ts_headline('simple', description, Q, 'StartSel="",StopSel="",MaxWords=14,MinWords=6,ShortWord=0') from tasks where user_id = $user and id in (...) and description is not null and not (to_tsvector('simple', title) @@ Q) and to_tsvector('simple', description) @@ Q`.

### The tag provider
Only when the text (without one leading `#`) is a single word: `scope.select(tags, { where: and(scope.isLive(tags), startsWith(tags.name, word)), limit })`, ordered as in D9.

---

## 5. API outline

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | /search | `{ "q": "pay re", "types": ["task","tag"], "limit": 5 }` (`types` and `limit` optional) | `{ "item": { "q": "pay re", "groups": [ { "type": "task", "items": [ { "type": "task", "id": "…", "title": "Pay rent to Mr. Nair", "snippet": null, "status": "todo", "dueAt": "2026-10-12T18:30:00.000Z", "dueAllDay": true, "archived": false, "parentTaskId": null } ] } ] } }` |

Errors: 400 `validation_error` (empty after trimming, over 100 characters, unknown type, limit out of range), 401 without a login, 503 `schema_behind` while the migration is missing. Action `search.global` (read). The route file follows `routes/task-report.ts`.

---

## 6. Files likely touched

| Area | Files |
|---|---|
| Contract (orchestrator) | `packages/shared/src/search.ts` (new), `packages/shared/src/index.ts` (export), `packages/db/drizzle/00NN_tasks_search_vector.sql` + its `meta` journal entry (generated by drizzle-kit `--custom`), `packages/db/src/schema.test.ts` (migration list) |
| Server | `apps/server/src/lib/user-scope.ts` (+ test), `apps/server/src/lib/no-direct-database.test.ts`, `apps/server/src/lib/search.ts` (+ test), `apps/server/src/actions/search.ts` (+ test), `apps/server/src/actions/index.ts` (register), `apps/server/src/routes/search.ts` (+ test), `apps/server/src/routes/v1.ts` |
| App | `apps/desktop/src/api/api-client.ts` (`signal`, + test), `apps/desktop/src/commands/command-palette.tsx` (+ test), `apps/desktop/src/commands/search-kinds.tsx` (new), `apps/desktop/src/commands/search-queries.ts` (new: `useSearch`), `apps/desktop/src/commands/highlight.ts` (+ test), `apps/desktop/src/store/recent-items-store.ts` (+ test), `apps/desktop/src/test/fake-api.ts` (a `/search` handler), the task mutation hooks only if they need to invalidate `['search']` |
| Docs (orchestrator) | docs/features/search.md, docs/DESIGN.md section 9, docs/DATABASE.md section 4, docs/API.md, docs/AI_SYSTEM.md (read list), docs/ARCHITECTURE.md if the folder list names files |

---

## 7. Build plan (parallel units and file ownership)

0. **Contract (orchestrator, committed before agents start; worktrees only see committed work):** the shared schemas of D8 with the action definition `search.global`; the migration of section 4 and the packages/db tests for it (trigger on insert, rename, description edit, backfill, RLS untouched); this memo as the spec. Check: `pnpm test` in packages/db and shared, `pnpm typecheck`.
1. **Unit A, server-dev (apps/server only):** `selectFields` with the isolation test and the guard update; `lib/search.ts` with its tests (E2 inputs, NUL, Malayalam, the EXPLAIN index test of D20); `actions/search.ts` with the task and tag providers and tests (two users, deleted, archived, done ranking, subtasks of a deleted parent, snippets only for description matches, limit, types); `routes/search.ts` and v1 wiring with route tests (401, 400, 503 schema_behind, happy path). Check: `pnpm --filter server test`, lint, typecheck.
2. **Unit B, ui-dev (apps/desktop only):** `signal` in the API client; `useSearch` (debounce 150 ms, min 2 characters, placeholder data, abort); `highlight.ts`; `search-kinds.tsx`; the palette changes (shouldFilter off, own command filtering and sorting, groups, rows, dimming, Searching…, no-result, error, live region, footer text, placeholder); `recent-items-store.ts`; the fake API handler; tests: keyboard flow (arrows across commands and results, Enter opens the task URL, Enter on a tag), selection does not jump when results arrive, stale results dimmed, 1-character input does not call the server, error keeps commands, recents appear and cap at 5, highlight of Malayalam and punctuation. Check: `pnpm --filter desktop test`, lint, typecheck. Use the `ui-design-system`, `data-hooks` and `testing-patterns` skills.
3. **Merge, then reviews** (code, design, security: `selectFields` and the trigger; docs), fixes, docs-sync, verify, the feature report with the migration to apply (`pnpm db:migrate`, by the owner) and a manual timing on Supabase.

Units A and B share no files. Unit B can start with the fake API from the contract; it does not need the server.

---

## 8. Suggested changes to existing docs (conflicts found)

1. **docs/API.md** lists `GET /search?q=&mode=&types=`. This memo uses `POST /search` (D7) so the search text stays out of Caddy's access log. The `mode` field joins the body in Step 3.
2. **docs/DESIGN.md section 9** says "For now it only runs commands"; replace with D14 to D18 (groups Recent, Tasks, Tags; rows; highlight style; footer "Enter to open"; states). Add the highlight style (lavender background, not bold) to the component list.
3. **docs/features/search.md** says the placeholder is "Type a command…"; it becomes "Search or type a command…" (matching the dashboard bar).
4. **docs/DATABASE.md section 4**: "filled from the title and module text" becomes the exact trigger (title A, description B; notes later); tags are searched by name prefix, not through the vector.
5. **docs/AI_SYSTEM.md section 4**: add `search.global` to the read actions.

---

## 9. Open points for the owner

1. Should a task also be found by its tag name (for example "home rent")? Now: no; open the Tags result instead (D2).
2. Is "start of words only" enough, or do you want typo tolerance and mid-word matches now (pg_trgm, which you would enable in the Supabase dashboard)? (D6)
3. Recent items on this device only (D18): keep, or drop for a cleaner empty palette?
4. Done and archived tasks rank at half weight (D9). Prefer to hide them unless asked?
5. POST instead of GET for search (D7): fine?
