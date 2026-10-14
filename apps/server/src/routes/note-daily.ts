import type { FastifyInstance } from 'fastify';
import { actionRunner, type ActionRouteOptions } from './run-action';

/**
 * POST /notes/daily (docs/API.md), stage N3. Registered before the /notes/:id routes in v1.ts.
 * Body `{ date? }` (YYYY-MM-DD, India day; default today). Opens or creates that day's note.
 */
export function noteDailyRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.post('/notes/daily', async (request) => {
    const { data, undo } = await run(request, 'notes.openDaily', request.body ?? {});
    return { item: data, undo: undo ?? null };
  });
}
