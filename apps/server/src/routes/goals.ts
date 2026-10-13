import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const bodyOf = (body: unknown) => z.record(z.string(), z.unknown()).parse(body);

/** /goals and PUT /tasks/:id/goal (docs/API.md). Owned by the Feature 8 server-dev agent. */
export function goalRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/goals', async (request) => {
    const { data } = await run(request, 'goals.list', request.query);
    return { items: data };
  });

  app.get('/goals/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data } = await run(request, 'goals.get', { id });
    return { item: data };
  });

  app.post('/goals', async (request, reply) => {
    const { data, undo } = await run(request, 'goals.create', request.body);
    return reply.status(201).send({ item: data, undo: undo ?? null });
  });

  app.patch('/goals/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'goals.update', { ...bodyOf(request.body), id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/goals/:id/status', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'goals.setStatus', { ...bodyOf(request.body), id });
    return { item: data, undo: undo ?? null };
  });

  app.delete('/goals/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'goals.delete', { id });
    return { item: data, undo: undo ?? null };
  });

  // Body { goalId: uuid | null }: put the task in a goal, move it, or take it out
  app.put('/tasks/:id/goal', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'goals.setTaskGoal', {
      ...bodyOf(request.body),
      taskId: id,
    });
    return { item: data, undo: undo ?? null };
  });
}
