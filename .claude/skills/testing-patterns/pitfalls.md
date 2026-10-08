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
