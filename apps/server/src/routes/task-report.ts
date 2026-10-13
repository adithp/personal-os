import type { FastifyInstance } from 'fastify';
import { actionRunner, type ActionRouteOptions } from './run-action';

/** GET /tasks/report?period=week|month (docs/API.md). Owned by the Feature 7 server-dev agent. */
export function taskReportRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/tasks/report', async (request) => {
    const { data } = await run(request, 'tasks.report', request.query);
    return { item: data };
  });
}
