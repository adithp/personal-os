---
name: new-action
description: Add a server action (the single way data changes) with its Zod input, permission level, handler, undo, registry entry, and tests. Use when adding or changing anything under apps/server/src/actions or packages/shared action definitions, including AI tools.
---

# new-action: add an action

Every data change goes through the action registry (docs/AI_SYSTEM.md). The UI and the AI call the same actions. Read `pitfalls.md` here first.

## Where things live
- Definition: `packages/shared/src/<module>.ts`. Use `defineAction({ name, description, permission, input })` and export the Zod input schemas and types. Action names are `<module>.<verb>` (for example `tasks.complete`). Export the file from `packages/shared/src/index.ts`.
- Handler: `apps/server/src/actions/<module>.ts`, written with `implement(definition, async (ctx, input) => ({ data, undo }))` and exported in an array (`taskImplementations`).
- Registry: add the array to `createRegistry` in `apps/server/src/actions/index.ts`.
- Rules for the registry itself are in `apps/server/src/actions/registry.ts` (input check, confirmation for `external` and `destructive`, observers that Step 3 uses for `ai_action_log`).

## Steps
1. **Write the check first** (see Tests below), then the code.
2. **Input:** a Zod schema in shared. Trim strings, bound lengths, use `z.uuid()` for ids, ISO strings with a zone for times (`z.iso.datetime({ offset: true })`). Never accept `userId`.
3. **Permission level** (docs/AI_SYSTEM.md section 4):
   - `read`: runs automatically.
   - `write`: runs, and returns an undo.
   - `external` (email to others, events with guests) and `destructive` (deletes, bulk changes): need `ctx.confirmed`. A button press in the app counts as confirmation; the AI path must ask.
4. **Handler:** use only `ctx.scope` (the `UserScope` helper: `select`, `selectFields` (chosen columns or computed SQL values such as a search rank, still filtered by user_id), `insert`, `update`, `delete`, `softDelete`, `transaction`). It adds `user_id` to every query. No other database connection, no raw SQL outside `apps/server/src/lib` (a test enforces it). Wrap multi-step changes in `scope.transaction`.
5. **Undo:** every `write` and `destructive` action returns `undo: { action, input }` that puts things back (another registered action plus its input), or `null` when nothing changed. Undo of a create is a delete; of an update, an update with the previous values; of a delete, a restore.
6. **Errors:** throw `HttpError(status, code, message)` (404 `not_found` for another user's rows, never 403, so ids do not leak; 409 for conflicts; 400 `validation_error` for state problems). Zod errors become 400 automatically.
7. **Docs:** update the action list in docs/AI_SYSTEM.md (section 5) and the module's feature doc (docs-sync skill).
8. **Route:** if the app needs it, add the route (api-route skill).

## Tests (Vitest, PGlite; see testing-patterns)
Every action needs: success, invalid input (a `ZodError`), user isolation (another user's row is a 404 and never visible), permission behavior (confirmation for external or destructive), and undo (run the returned undo and check the state is back). Add the registry-level checks in the module's `*.test.ts` next to the handler.

## Stub-then-fill
When an action must call code a later feature builds, create a stub file with the final signature that does nothing (`task-dependencies.ts`, `recurrence.ts`) and call it from the handler now, so the later feature never edits the handler.
