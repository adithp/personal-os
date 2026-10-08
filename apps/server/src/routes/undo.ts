import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../lib/http-error';
import { actionRunner, type ActionRouteOptions } from './run-action';

const undoBody = z.object({
  action: z.string().min(1).max(100),
  input: z.record(z.string(), z.unknown()),
});

/**
 * POST /undo runs the undo that a write returned (an action and its input). Only actions that
 * change data can be run this way, and they check their input like any other call.
 */
export function undoRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.post('/undo', async (request) => {
    const { action, input } = undoBody.parse(request.body);
    const permission = options.registry.permissionOf(action);
    if (permission !== 'write' && permission !== 'destructive') {
      throw new HttpError(400, 'cannot_undo', 'That cannot be undone');
    }
    const { data, undo } = await run(request, action, input);
    return { item: data, undo: undo ?? null };
  });
}
