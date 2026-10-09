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
