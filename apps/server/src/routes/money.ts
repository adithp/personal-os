import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { moneyPlanningRoutes } from './money-planning';
import { mountWrites } from './money-shared';
import { moneySubscriptionRoutes } from './money-subscriptions';
import { actionRunner, type ActionRouteOptions } from './run-action';

const walletQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });

const transactionQuery = z.object({
  walletId: z.string().optional(),
  categoryId: z.string().optional(),
  kind: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

/**
 * Money routes (docs/features/money.md, docs/API.md): wallets, categories, transactions here;
 * repeats, budgets, goals and the summary in money-planning.ts; subscriptions in
 * money-subscriptions.ts. Reads answer { items }, writes { item, undo }.
 */
export function moneyRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/wallets', async (request) => {
    const query = walletQuery.parse(request.query);
    const { data } = await run(request, 'finance.wallets.list', {
      includeArchived: query.includeArchived === 'true',
    });
    return { items: data };
  });
  mountWrites(app, run, '/wallets', {
    create: 'finance.wallets.create',
    update: 'finance.wallets.update',
    delete: 'finance.wallets.delete',
    restore: 'finance.wallets.restore',
  });

  app.get('/categories', async (request) => {
    const { data } = await run(request, 'finance.categories.list', {});
    return { items: data };
  });
  mountWrites(app, run, '/categories', {
    create: 'finance.categories.create',
    update: 'finance.categories.update',
    delete: 'finance.categories.delete',
    restore: 'finance.categories.restore',
  });

  app.get('/transactions', async (request) => {
    const query = transactionQuery.parse(request.query);
    const { data } = await run(request, 'finance.transactions.list', query);
    return { items: data };
  });
  mountWrites(app, run, '/transactions', {
    create: 'finance.transactions.create',
    update: 'finance.transactions.update',
    delete: 'finance.transactions.delete',
    restore: 'finance.transactions.restore',
  });

  moneyPlanningRoutes(app, run);
  moneySubscriptionRoutes(app, run);
}
