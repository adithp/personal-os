import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });

/** /tags routes (docs/API.md): GET /tags, POST /tags, PATCH /tags/:id, DELETE /tags/:id, POST /tags/:id/merge. */
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

  app.delete('/tags/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'tags.delete', { id });
    return { item: data, undo: undo ?? null };
  });

  // The tag in the path is merged into targetId; the answer is the target tag
  app.post('/tags/:id/merge', async (request) => {
    const { id } = idParams.parse(request.params);
    const { targetId } = z.object({ targetId: z.uuid() }).parse(request.body);
    const { data, undo } = await run(request, 'tags.merge', { sourceId: id, targetId });
    return { item: data, undo: undo ?? null };
  });
}
