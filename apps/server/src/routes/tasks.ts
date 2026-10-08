import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });

/** /tasks (docs/API.md). Every route calls the matching action. */
export function taskRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/tasks', async (request) => {
    const { data } = await run(request, 'tasks.list', request.query);
    return { items: data };
  });

  app.get('/tasks/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data } = await run(request, 'tasks.get', { id });
    return { item: data };
  });

  app.post('/tasks', async (request, reply) => {
    const { data, undo } = await run(request, 'tasks.create', request.body);
    return reply.status(201).send({ item: data, undo: undo ?? null });
  });

  app.patch('/tasks/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    const { data, undo } = await run(request, 'tasks.update', { ...body, id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/tasks/:id/complete', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'tasks.complete', { id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/tasks/:id/archive', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'tasks.archive', { id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/tasks/:id/unarchive', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'tasks.unarchive', { id });
    return { item: data, undo: undo ?? null };
  });

  // Soft delete: the task can be restored with the returned undo.
  app.delete('/tasks/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'tasks.delete', { id });
    return { item: data, undo: undo ?? null };
  });
}
