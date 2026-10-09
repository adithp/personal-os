import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const blockerParams = z.object({ id: z.uuid(), blockerId: z.uuid() });
const addBody = z.object({ blockerId: z.uuid() });

/** /tasks/:id/blockers (docs/API.md). Owned by the Feature 3 server-dev agent. */
export function taskDependencyRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.post('/tasks/:id/blockers', async (request) => {
    const { id } = idParams.parse(request.params);
    const { blockerId } = addBody.parse(request.body);
    const { data, undo } = await run(request, 'tasks.addBlocker', { id, blockerId });
    return { item: data, undo: undo ?? null };
  });

  app.delete('/tasks/:id/blockers/:blockerId', async (request) => {
    const { id, blockerId } = blockerParams.parse(request.params);
    const { data, undo } = await run(request, 'tasks.removeBlocker', { id, blockerId });
    return { item: data, undo: undo ?? null };
  });
}
