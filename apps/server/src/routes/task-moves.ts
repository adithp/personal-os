import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });

/** POST /tasks/:id/move (docs/API.md). Owned by the Feature 2 server-dev agent. */
export function taskMoveRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.post('/tasks/:id/move', async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    const { data, undo } = await run(request, 'tasks.move', { ...body, id });
    return { item: data, undo: undo ?? null };
  });
}
