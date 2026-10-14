import type { FastifyInstance } from 'fastify';
import { actionRunner, type ActionRouteOptions } from './run-action';

/**
 * POST /search (docs/API.md, memo D7): a POST so the search text stays out of access logs.
 * Body { q, types?, limit? }, answer { item: { q, groups } }.
 */
export function searchRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.post('/search', async (request) => {
    const { data } = await run(request, 'search.global', request.body);
    return { item: data };
  });
}
