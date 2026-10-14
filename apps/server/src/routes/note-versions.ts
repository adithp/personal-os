import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const versionParams = z.object({ id: z.uuid(), versionId: z.uuid() });

/**
 * Version history routes (docs/API.md), stage N4. Registered before noteRoutes in v1.ts so the
 * /notes/:id/... patterns never swallow them.
 */
export function noteVersionRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/notes/:id/versions', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data } = await run(request, 'notes.versions', { id });
    return { items: data };
  });

  app.get('/notes/:id/versions/:versionId', async (request) => {
    const { id, versionId } = versionParams.parse(request.params);
    const { data } = await run(request, 'notes.getVersion', { id, versionId });
    return { item: data };
  });

  app.post('/notes/:id/restore/:versionId', async (request) => {
    const { id, versionId } = versionParams.parse(request.params);
    const { data, undo } = await run(request, 'notes.restoreVersion', { id, versionId });
    return { item: data, undo: undo ?? null };
  });
}
