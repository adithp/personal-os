---
name: api-route
description: Add or change a Fastify route under /api/v1 that calls registry actions, with Zod validation, the error format, and route tests. Use for any file in apps/server/src/routes.
---

# api-route: add a route

Routes are thin: they check the request and call an action. Business rules live in the action (new-action skill). Read `pitfalls.md` here first.

## Pattern (copy `routes/tasks.ts`)
```ts
export function thingRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);
  app.get('/things', async (request) => {
    const { data } = await run(request, 'things.list', request.query);
    return { items: data };
  });
}
```
- `actionRunner` (routes/run-action.ts) builds the `UserScope` from the verified user and calls `registry.run` with `confirmed: true` (a button press confirms). It throws 401 when `request.user` is missing.
- Register the route function in `routes/v1.ts` inside the protected scope (`requireLogin(protectedApp, verifier)` is called once for the scope; Fastify hooks apply only to the scope they are added in). Only `/health` is open.
- Paths are relative; Fastify adds the `/api/v1` prefix. Caddy does not rewrite paths.

## Rules
- **Auth:** every route behind `requireLogin` (Supabase JWT checked against the project's JWKS with `jose`). Missing, wrong, or expired tokens all give the same 401.
- **Validation:** params with `z.object({ id: z.uuid() })`; bodies and queries are validated again by the action's Zod input. Take the id from the path, never from the body (`{ ...body, id }`).
- **Responses:** list `{ items }`; one `{ item }`; writes `{ item, undo }` (undo is `null` when nothing changed); create answers 201. Times are ISO strings in UTC.
- **Errors:** always `{ "error": { "code": string, "message": string } }`. The app-level error handler maps `HttpError`, `ZodError` (400 `validation_error`), framework 4xx (`bad_request`), a missing migration (503 `schema_behind`), and everything else to a 500 that never leaks details. Do not build your own error bodies.
- **Logs:** never log tokens, bodies, or query strings (the logger redacts the Authorization header and drops query strings).
- **Soft delete:** DELETE routes call the delete action and return the undo.
- **Docs:** add the route to the table in docs/API.md (docs-sync skill).

## Route tests (use PGlite and the JWT test keys; see testing-patterns)
For every route: 401 with no token, a stranger's token, and an expired token; 400 with invalid input; the happy path; and user isolation (another user's id gives 404, and the other user can still see their data). Add undo round trips for writes.
