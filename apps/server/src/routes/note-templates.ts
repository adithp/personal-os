import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const bodyOf = (body: unknown) => z.record(z.string(), z.unknown()).parse(body ?? {});

/** /note-templates (docs/API.md), stage N3. */
export function noteTemplateRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/note-templates', async (request) => {
    const { data } = await run(request, 'noteTemplates.list', {});
    return { items: data };
  });

  app.post('/note-templates', async (request, reply) => {
    const { data, undo } = await run(request, 'noteTemplates.create', request.body ?? {});
    return reply.status(201).send({ item: data, undo: undo ?? null });
  });

  app.patch('/note-templates/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'noteTemplates.update', {
      ...bodyOf(request.body),
      id,
    });
    return { item: data, undo: undo ?? null };
  });

  app.post('/note-templates/:id/restore', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'noteTemplates.restore', { id });
    return { item: data, undo: undo ?? null };
  });

  app.delete('/note-templates/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'noteTemplates.delete', { id });
    return { item: data, undo: undo ?? null };
  });
}
