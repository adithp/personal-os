import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionRunner, type ActionRouteOptions } from './run-action';

const idParams = z.object({ id: z.uuid() });
const bodyOf = (body: unknown) => z.record(z.string(), z.unknown()).parse(body ?? {});

/** /notes and /note-folders (docs/API.md). Owned by the N1 server-dev agents. */
export function noteRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const run = actionRunner(options);

  app.get('/notes', async (request) => {
    const { data } = await run(request, 'notes.list', request.query);
    return { items: data };
  });

  // Declared before /notes/:id so "trash" is not read as an id
  app.delete('/notes/trash', async (request) => {
    const { data } = await run(request, 'notes.emptyTrash', {});
    return { item: data, undo: null };
  });

  app.get('/notes/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data } = await run(request, 'notes.get', { id });
    return { item: data };
  });

  app.post('/notes', async (request, reply) => {
    const { data, undo } = await run(request, 'notes.create', request.body ?? {});
    return reply.status(201).send({ item: data, undo: undo ?? null });
  });

  app.patch('/notes/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'notes.update', { ...bodyOf(request.body), id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/notes/:id/rename', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'notes.rename', { ...bodyOf(request.body), id });
    // The action has no place for the ids of notes whose links were rewritten (link stage later)
    return { item: data, undo: undo ?? null, updatedNoteIds: [] as string[] };
  });

  app.delete('/notes/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'notes.delete', { id });
    return { item: data, undo: undo ?? null };
  });

  app.post('/notes/:id/restore', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'notes.restore', { id });
    return { item: data, undo: undo ?? null };
  });

  app.delete('/notes/:id/forever', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data } = await run(request, 'notes.purge', { id });
    return { item: data, undo: null };
  });

  app.get('/note-folders', async (request) => {
    const { data } = await run(request, 'noteFolders.list', {});
    return { items: data };
  });

  app.post('/note-folders', async (request, reply) => {
    const { data, undo } = await run(request, 'noteFolders.create', request.body ?? {});
    return reply.status(201).send({ item: data, undo: undo ?? null });
  });

  app.patch('/note-folders/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'noteFolders.update', {
      ...bodyOf(request.body),
      id,
    });
    return { item: data, undo: undo ?? null };
  });

  app.post('/note-folders/:id/restore', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'noteFolders.restore', { id });
    return { item: data, undo: undo ?? null };
  });

  app.delete('/note-folders/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { data, undo } = await run(request, 'noteFolders.delete', { id });
    return { item: data, undo: undo ?? null };
  });
}
