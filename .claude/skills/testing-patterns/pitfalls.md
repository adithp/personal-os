# Pitfalls: testing-patterns

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10: PGlite test files time out when many run in parallel
- Symptom: Hook timed out in beforeAll; 5 server files failed in a full run but passed alone
- Cause: PGlite starts slowly when many files run at once
- Fix: hookTimeout 60 s and testTimeout 30 s; run the failing project alone before calling a failure real
- Prevention: guarded, apps/server and packages/db vitest.config.ts hookTimeout 60 s; scripts/repo-guards.test.mjs

### 2026-10: jsdom lacks ResizeObserver, scrollIntoView, scrollTo, and canvas
- Symptom: ReferenceError or TypeError for ResizeObserver or scrollIntoView in component tests
- Cause: jsdom does not implement them
- Fix: Polyfilled in the shared test setup; canvas is stubbed where the glass engine is tested
- Prevention: guarded, apps/desktop/src/test/setup.ts and scripts/repo-guards.test.mjs

### 2026-10: jsdom ignores keyboard stepping on range inputs
- Symptom: A slider test using arrow keys did not change the value
- Cause: jsdom does not implement range stepping
- Fix: Use fireEvent.change with the new value
- Prevention: documented, testing-patterns pitfalls

### 2026-10-09: Text queries clash with the Tasks side panel ("Found multiple elements with the text: My tasks")
- Symptom: getByText('My tasks') matched the side panel item and the page title
- Cause: The same words appear in several places
- Fix: Query by role and name (getByRole('heading', { name })) instead of text
- Prevention: documented, testing-patterns pitfalls

### 2026-10: Fake timers need userEvent wired to them, and must be restored
- Symptom: user-event hung with vi.useFakeTimers
- Cause: userEvent waits on real timers unless advanceTimers is given
- Fix: userEvent.setup({ advanceTimers: (ms) => { vi.advanceTimersByTime(ms); } }) and vi.useRealTimers() in afterEach
- Prevention: documented, testing-patterns pitfalls

### 2026-10-09: HttpError has statusCode, not status
- Symptom: toMatchObject({ status: 404 }) failed in a server test
- Cause: The HttpError class stores the number in statusCode
- Fix: Assert statusCode (and code)
- Prevention: documented, testing-patterns pitfalls

### 2026-10-09: dnd-kit adds a role=status live region, so bare role queries for toasts find several elements
- Symptom: findByRole(status) found more than one element once drag and drop existed
- Cause: dnd-kit renders a hidden live region with role status
- Fix: Find toasts by their text (the findToast helper in my-tasks/test-utils.ts searches status and alert)
- Prevention: documented, testing-patterns pitfalls

### 2026-10-09: Keyboard dragging in jsdom needs mocked layout
- Symptom: A keyboard drag did nothing or started over the wrong area
- Cause: sortableKeyboardCoordinates reads element rects and jsdom returns zeros; with a DragOverlay dnd-kit measures the overlay node, so it needs the lifted card rect too
- Fix: Mock getBoundingClientRect for columns, cards and the [data-drag-overlay] element (see board-view.test.tsx and drag-drop.test.tsx)
- Prevention: documented, testing-patterns pitfalls

### 2026-10-09: Page tests passed alone but timed out in a full run
- Symptom: Two my-tasks page tests failed with a 5 s timeout in pnpm test and passed when run alone
- Cause: The full run starts the server tests too and the machine is busy
- Fix: testTimeout is 20 s in apps/desktop/vitest.config.ts; run the failing file alone before calling a failure real
- Prevention: guarded, apps/desktop/vitest.config.ts

### 2026-10-09: Build the promises of a rejection test lazily
- Symptom: Vitest reported Unhandled Rejection for tests that expected errors
- Cause: An array of registry.run(...) promises that reject was awaited one by one, so the later ones rejected unhandled
- Fix: Use an array of functions and call them one after the other
- Prevention: documented, testing-patterns pitfalls

### 2026-10-13: A query added on mount broke the failNext error tests
- Symptom: Three page tests that expect an error screen stopped failing
- Cause: failNext hits the next request of any path and the new favorites list loads first
- Fix: fake.failNext skips /task-favorites requests unless anyPath is true
- Prevention: guarded, apps/desktop/src/test/fake-api.ts

### 2026-10-13: Dialog and page tests find several elements of the same role
- Symptom: getByRole(listitem/status/button Close) found more than one
- Cause: The whole page is rendered behind the dialog
- Fix: Scope queries with within(dialog), read toasts from useToasts.getState(), render the dialog alone for loading and error states
- Prevention: documented, testing-patterns pitfalls

### 2026-10-13: A test that races a short fake delay is flaky on a busy machine
- Symptom: quick-add-bar-fixes failed in full runs and passed alone
- Cause: fake.slow(100) was shorter than the typing under load
- Fix: Use a long delay (1.5 s) and a long findBy timeout so the order of events is fixed
- Prevention: guarded, quick-add-bar-fixes.test.tsx

### 2026-10-13: A test that fakes the clock must sign its login token after setting the time
- Symptom: A route test returned 401 instead of 200 after vi.setSystemTime
- Cause: The shared token was signed with the real clock and looked expired at the fake time
- Fix: Sign a new token after setting the system time
- Prevention: documented, testing-patterns pitfalls

### 2026-10-13: failNext hit the first request of the page, not the one under test
- Symptom: Error-state tests stopped failing when the side panel started loading the Inbox count on mount
- Cause: failNext applied to the next request of any path
- Fix: fake.failNext takes a path prefix as its 4th argument (true = any path)
- Prevention: guarded, apps/desktop/src/test/fake-api.ts

### 2026-10-13: Vitest passed but the real server crashed on a CommonJS import
- Symptom: pnpm dev:server stopped with "The requested module 'rrule' does not provide an export named 'RRule'" while all tests were green
- Cause: Vitest converts module formats; real Node cannot import the named exports of a CommonJS package from an ES module
- Fix: load rrule with createRequire in recurrence.ts
- Prevention: guarded, apps/server/src/startup-imports.test.ts imports every action and route in real Node with tsx; also start the server once before reporting a feature done

### 2026-10-14: Mock hooks with their real return shape; TipTap setEditable emits update
- Symptom: The editor pane passed its tests but read the wrong shape from useRenameNote (a bare note instead of { item }); opening a note sent a PATCH
- Cause: The test mocked the hook with a made-up shape; editor.setEditable(x) emits an update event by default
- Fix: Type hook mocks with the real return types; call setEditable(x, false)
- Prevention: guarded, notes editor tests

### 2026-10-14: TipTap input rules and floating menus in jsdom
- Symptom: typed `[[x]]` stayed text; a findBy on the `[[` menu timed out under fake timers
- Cause: nodeInputRule replaces only capture group 1; insertContent does not run input rules; findBy does not advance fake timers
- Fix: use InputRule with a handler that replaces the whole range; type through view.someProp('handleTextInput'); use vi.waitFor
- Prevention: a typeChar helper in the wikilink tests

### 2026-10-14: A shared server test helper that runs raw SQL must be a .test.ts file
- Symptom: no-direct-database.test.ts failed on actions/money-test-utils.ts (db.execute and the db testing import)
- Cause: The rule scans every non-.test.ts file outside src/lib
- Fix: The helper is money-test-utils.test.ts (with one small test so Vitest accepts the file)
- Prevention: guarded, apps/server/src/lib/no-direct-database.test.ts
