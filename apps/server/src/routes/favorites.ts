import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const bodyOf = (body: unknown) => z.record(z.string(), z.unknown()).parse(body);

/** /task-favorites (docs/API.md). Owned by the Feature 5 favorites server-dev agent. */
export function favoriteRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/task-favorites', async (request) => {
    const { data } = await run(request, 'favorites.list', {});
    return { items: data };
  });

  app.post('/task-favorites', async (request, reply) => {
    const { data, undo } = await run(request, 'favorites.create', request.body);
    return reply.status(201).send({ item: data, undo: undo ?? null });
  });

  app.patch('/task-favorites/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'favorites.update', { ...bodyOf(request.body), id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/task-favorites/:id/move', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'favorites.move', { ...bodyOf(request.body), id });
    return { item: data, undo: undo ?? null };
  });

  app.delete('/task-favorites/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'favorites.delete', { id });
    return { item: data, undo: undo ?? null };
  });
}
