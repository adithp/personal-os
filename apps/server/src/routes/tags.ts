import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });

/** /tags routes (docs/API.md): GET /tags, POST /tags, PATCH /tags/:id. */
export function tagRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/tags', async (request) => {
    const { data } = await run(request, 'tags.list', {});
    return { items: data };
  });

  // 201 when the tag was created, 200 when a tag with that name (ignoring case) already existed
  app.post('/tags', async (request, reply) => {
    const { data } = await run(request, 'tags.create', request.body);
    const { created, ...item } = data as { created: boolean };
    return reply.status(created ? 201 : 200).send({ item, undo: null });
  });

  app.patch('/tags/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    const { data, undo } = await run(request, 'tags.update', { ...body, id });
    return { item: data, undo: undo ?? null };
  });
}
