import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { actionRunner } from './run-action';

export type Run = ReturnType<typeof actionRunner>;

export const idParams = z.object({ id: z.uuid() });
export const bodyOf = (body: unknown) => z.record(z.string(), z.unknown()).parse(body ?? {});

/** What every Money write answers (docs/features/money.md). */
export const written = (outcome: { data: unknown; undo?: unknown }) => ({
  item: outcome.data,
  undo: outcome.undo ?? null,
});

interface WriteActions {
  create: string;
  update?: string;
  delete: string;
  restore: string;
}

/** POST (201), PATCH /:id, DELETE /:id and POST /:id/restore of one Money resource. */
export function mountWrites(app: FastifyInstance, run: Run, path: string, actions: WriteActions) {
  app.post(path, async (request, reply) => {
    const outcome = await run(request, actions.create, request.body);
    return reply.status(201).send(written(outcome));
  });

  const { update } = actions;
  if (update) {
    app.patch(`${path}/:id`, async (request) => {
      const { id } = idParams.parse(request.params);
      return written(await run(request, update, { ...bodyOf(request.body), id }));
    });
  }

  app.delete(`${path}/:id`, async (request) => {
    const { id } = idParams.parse(request.params);
    return written(await run(request, actions.delete, { id }));
  });

  app.post(`${path}/:id/restore`, async (request) => {
    const { id } = idParams.parse(request.params);
    return written(await run(request, actions.restore, { id }));
  });
}
