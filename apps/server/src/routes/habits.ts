import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const bodyOf = (body: unknown) => z.record(z.string(), z.unknown()).parse(body ?? {});

/** /habits (docs/API.md). */
export function habitRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/habits', async (request) => {
    const { data } = await run(request, 'habits.list', request.query);
    return { items: data };
  });

  app.post('/habits', async (request, reply) => {
    const { data, undo } = await run(request, 'habits.create', request.body ?? {});
    return reply.status(201).send({ item: data, undo: undo ?? null });
  });

  app.get('/habits/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data } = await run(request, 'habits.get', { id });
    return { item: data };
  });

  app.patch('/habits/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'habits.update', { ...bodyOf(request.body), id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/habits/:id/archive', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'habits.archive', { id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/habits/:id/restore', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'habits.restore', { id });
    return { item: data, undo: undo ?? null };
  });

  // Marks a day done (no count: the target) or sets its count
  app.put('/habits/:id/log', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'habits.log', { ...bodyOf(request.body), id });
    return { item: data, undo: undo ?? null };
  });

  app.delete('/habits/:id/log', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'habits.unlog', {
      ...bodyOf(request.query),
      id,
    });
    return { item: data, undo: undo ?? null };
  });

  app.get('/habits/:id/stats', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data } = await run(request, 'habits.stats', { ...bodyOf(request.query), id });
    return { item: data };
  });
}
