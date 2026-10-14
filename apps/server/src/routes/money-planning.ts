import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bodyOf, idParams, mountWrites, written, type Run } from './money-shared';

const monthQuery = z.object({ month: z.string().optional() });

/** Repeating transactions, budgets, savings goals and the monthly summary (docs/features/money.md). */
export function moneyPlanningRoutes(app: FastifyInstance, run: Run): void {
  app.get('/recurring-transactions', async (request) => {
    const { data } = await run(request, 'finance.recurring.list', {});
    return { items: data };
  });
  // Registered before the /:id routes; the Money page calls it when it opens
  app.post('/recurring-transactions/run', async (request) => {
    const { data } = await run(request, 'finance.recurring.run', {});
    return data;
  });
  mountWrites(app, run, '/recurring-transactions', {
    create: 'finance.recurring.create',
    update: 'finance.recurring.update',
    delete: 'finance.recurring.delete',
    restore: 'finance.recurring.restore',
  });

  app.get('/budgets', async (request) => {
    const query = monthQuery.parse(request.query);
    const { data } = await run(request, 'finance.budgets.list', query);
    return { items: data };
  });
  app.put('/budgets', async (request) => written(await run(request, 'finance.budgets.set', request.body)));
  app.delete('/budgets/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    return written(await run(request, 'finance.budgets.delete', { id }));
  });

  app.get('/savings-goals', async (request) => {
    const { data } = await run(request, 'finance.goals.list', {});
    return { items: data };
  });
  mountWrites(app, run, '/savings-goals', {
    create: 'finance.goals.create',
    update: 'finance.goals.update',
    delete: 'finance.goals.delete',
    restore: 'finance.goals.restore',
  });
  app.post('/savings-goals/:id/contribute', async (request) => {
    const { id } = idParams.parse(request.params);
    return written(await run(request, 'finance.goals.contribute', { ...bodyOf(request.body), id }));
  });

  app.get('/finance/summary', async (request) => {
    const query = monthQuery.parse(request.query);
    const { data } = await run(request, 'finance.summary', query);
    return { summary: data };
  });
}
