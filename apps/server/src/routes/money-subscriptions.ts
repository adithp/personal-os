import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bodyOf, idParams, mountWrites, written, type Run } from './money-shared';

const listQuery = z.object({ status: z.string().optional() });
const upcomingQuery = z.object({ days: z.coerce.number().optional() });

/** /subscriptions (docs/features/money.md). */
export function moneySubscriptionRoutes(app: FastifyInstance, run: Run): void {
  app.get('/subscriptions', async (request) => {
    const query = listQuery.parse(request.query);
    const { data } = await run(request, 'subscriptions.list', query);
    return data;
  });
  app.get('/subscriptions/upcoming', async (request) => {
    const query = upcomingQuery.parse(request.query);
    const { data } = await run(request, 'subscriptions.upcoming', query);
    return { items: data };
  });
  mountWrites(app, run, '/subscriptions', {
    create: 'subscriptions.create',
    update: 'subscriptions.update',
    delete: 'subscriptions.delete',
    restore: 'subscriptions.restore',
  });
  app.post('/subscriptions/:id/renew', async (request) => {
    const { id } = idParams.parse(request.params);
    return written(await run(request, 'subscriptions.renew', { ...bodyOf(request.body), id }));
  });
}
