import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const bodyOf = (body: unknown) => z.record(z.string(), z.unknown()).parse(body ?? {});

/**
 * Clients, projects, milestones and time entries (docs/API.md, Projects). Lists answer { items },
 * reads { item }, writes { item, undo } (creates with status 201).
 */
export function projectRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  const read = async (request: FastifyRequest, action: string, input: unknown) => ({
    item: (await run(request, action, input)).data,
  });
  const list = async (request: FastifyRequest, action: string, input: unknown) => ({
    items: (await run(request, action, input)).data,
  });
  const write = async (request: FastifyRequest, action: string, input: unknown) => {
    const { data, undo } = await run(request, action, input);
    return { item: data, undo: undo ?? null };
  };
  const withId = (request: FastifyRequest, extra: unknown = {}) => ({
    ...bodyOf(extra),
    id: idParams.parse(request.params).id,
  });

  // ----- Clients
  app.get('/clients', (request) => list(request, 'clients.list', {}));
  app.get('/clients/:id', (request) => read(request, 'clients.get', withId(request)));
  app.post('/clients', async (request, reply) =>
    reply.status(201).send(await write(request, 'clients.create', request.body)),
  );
  app.patch('/clients/:id', (request) =>
    write(request, 'clients.update', withId(request, request.body)),
  );
  app.delete('/clients/:id', (request) => write(request, 'clients.delete', withId(request)));

  // ----- Projects
  app.get('/projects', (request) => list(request, 'projects.list', request.query));
  app.get('/projects/:id', (request) => read(request, 'projects.get', withId(request)));
  app.post('/projects', async (request, reply) =>
    reply.status(201).send(await write(request, 'projects.create', request.body)),
  );
  app.patch('/projects/:id', (request) =>
    write(request, 'projects.update', withId(request, request.body)),
  );
  app.post('/projects/:id/status', (request) =>
    write(request, 'projects.setStatus', withId(request, request.body)),
  );
  app.delete('/projects/:id', (request) => write(request, 'projects.delete', withId(request)));
  app.get('/projects/:id/items', (request) => read(request, 'projects.items', withId(request)));

  app.get('/tasks/:id/project', (request) =>
    read(request, 'projects.taskProject', { taskId: idParams.parse(request.params).id }),
  );
  // Body { projectId: uuid | null }: put the task or note in a project, move it, or take it out
  app.put('/tasks/:id/project', (request) =>
    write(request, 'projects.setTaskProject', {
      ...bodyOf(request.body),
      taskId: idParams.parse(request.params).id,
    }),
  );
  app.put('/notes/:id/project', (request) =>
    write(request, 'projects.setNoteProject', {
      ...bodyOf(request.body),
      noteId: idParams.parse(request.params).id,
    }),
  );

  // ----- Milestones
  app.get('/projects/:id/milestones', (request) =>
    list(request, 'milestones.list', { projectId: idParams.parse(request.params).id }),
  );
  app.post('/projects/:id/milestones', async (request, reply) =>
    reply.status(201).send(
      await write(request, 'milestones.create', {
        ...bodyOf(request.body),
        projectId: idParams.parse(request.params).id,
      }),
    ),
  );
  app.patch('/milestones/:id', (request) =>
    write(request, 'milestones.update', withId(request, request.body)),
  );
  app.delete('/milestones/:id', (request) => write(request, 'milestones.delete', withId(request)));

  // ----- Time entries (fixed paths first, then the ones with an id)
  app.get('/time-entries', (request) => list(request, 'time.list', request.query));
  app.get('/time-entries/running', (request) => read(request, 'time.running', {}));
  app.get('/time-entries/summary', (request) => read(request, 'time.summary', request.query));
  app.post('/time-entries/start', async (request, reply) =>
    reply.status(201).send(await write(request, 'time.start', request.body)),
  );
  app.post('/time-entries/stop', (request) => write(request, 'time.stop', bodyOf(request.body)));
  app.post('/time-entries', async (request, reply) =>
    reply.status(201).send(await write(request, 'time.add', request.body)),
  );
  app.patch('/time-entries/:id', (request) =>
    write(request, 'time.update', withId(request, request.body)),
  );
  app.delete('/time-entries/:id', (request) => write(request, 'time.delete', withId(request)));
}
