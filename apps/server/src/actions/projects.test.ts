import { entities, links, timeEntries } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import type {
  Client,
  Milestone,
  Project,
  ProjectItems,
  Task,
  TaskProject,
  TimeEntry,
  TimeSummary,
} from '@personal-os/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';

const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';
const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

let t: TestDb;
const registry = createRegistry();

const context = (userId: string): ActionContext => ({
  scope: createUserScope(t.db, userId),
  source: 'ui',
  confirmed: true,
});
const alice = () => context(ALICE);
const bob = () => context(BOB);

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(
    sql`truncate table time_entries, project_milestones, projects, clients, goals, notes, note_folders, entity_tags, tags, links, tasks, entities, auth.users cascade`,
  );
  await createTestUser(t.db, ALICE);
  await createTestUser(t.db, BOB);
});

interface Undo {
  action: string;
  input: Record<string, unknown>;
}
interface Result<T> {
  data: T;
  undo?: Undo | null;
}

const run = async <T>(ctx: ActionContext, name: string, input: unknown) =>
  (await registry.run(ctx, name, input)) as Result<T>;
const undoOf = (result: Result<unknown>): Undo => {
  if (!result.undo) throw new Error('Expected an undo');
  return result.undo;
};
const doUndo = (ctx: ActionContext, result: Result<unknown>) => {
  const undo = undoOf(result);
  return run(ctx, undo.action, undo.input);
};
const statusCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error.statusCode;
    throw error;
  }
  return 0;
};

const clientOf = async (ctx: ActionContext, name: string, more: Record<string, unknown> = {}) =>
  (await run<Client>(ctx, 'clients.create', { name, ...more })).data;
const projectOf = async (ctx: ActionContext, title: string, more: Record<string, unknown> = {}) =>
  (await run<Project>(ctx, 'projects.create', { title, ...more })).data;
const getProject = async (ctx: ActionContext, id: string) =>
  (await run<Project>(ctx, 'projects.get', { id })).data;
const taskOf = async (ctx: ActionContext, title: string, more: Record<string, unknown> = {}) =>
  (await run<Task>(ctx, 'tasks.create', { title, ...more })).data;
const noteOf = async (ctx: ActionContext, title: string) =>
  (await run<{ id: string }>(ctx, 'notes.create', { title })).data;
const itemsOf = async (ctx: ActionContext, id: string) =>
  (await run<ProjectItems>(ctx, 'projects.items', { id })).data;
const taskProjectOf = async (ctx: ActionContext, taskId: string) =>
  (await run<TaskProject | null>(ctx, 'projects.taskProject', { taskId })).data;

describe('clients', () => {
  it('creates a client with its entity, trims, turns empty text into null, and undo deletes it', async () => {
    const created = await run<Client>(alice(), 'clients.create', {
      name: '  Acme ',
      email: 'a@acme.test',
      phone: '',
    });
    expect(created.data).toMatchObject({
      name: 'Acme',
      email: 'a@acme.test',
      phone: null,
      company: null,
      projectCount: 0,
      trackedSeconds: 0,
    });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, created.data.id));
    expect(entity).toMatchObject({ type: 'client', title: 'Acme' });
    await doUndo(alice(), created);
    expect(await statusCode(registry.run(alice(), 'clients.get', { id: created.data.id }))).toBe(
      404,
    );
  });

  it('rejects bad input', async () => {
    await expect(registry.run(alice(), 'clients.create', { name: '  ' })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(registry.run(alice(), 'clients.update', { id: MISSING })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it('updates with an undo that restores the old values, and renames the entity', async () => {
    const client = await clientOf(alice(), 'Acme', { company: 'Acme Ltd' });
    const updated = await run<Client>(alice(), 'clients.update', {
      id: client.id,
      name: 'Acme 2',
      company: null,
    });
    expect(updated.data).toMatchObject({ name: 'Acme 2', company: null });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, client.id));
    expect(entity?.title).toBe('Acme 2');
    await doUndo(alice(), updated);
    expect(
      (await run<Client>(alice(), 'clients.get', { id: client.id })).data,
    ).toMatchObject({ name: 'Acme', company: 'Acme Ltd' });
    const same = await run<Client>(alice(), 'clients.update', { id: client.id, name: 'Acme' });
    expect(same.undo).toBeNull();
  });

  it('lists with project count and tracked seconds, sorted by name', async () => {
    const b = await clientOf(alice(), 'Beta');
    await clientOf(alice(), 'alpha');
    const project = await projectOf(alice(), 'P', { clientId: b.id });
    await projectOf(alice(), 'Q', { clientId: b.id });
    await run(alice(), 'time.add', {
      projectId: project.id,
      startedAt: '2026-10-01T10:00:00.000Z',
      endedAt: '2026-10-01T11:30:00.000Z',
    });
    const list = (await run<Client[]>(alice(), 'clients.list', {})).data;
    expect(list.map((c) => c.name)).toEqual(['alpha', 'Beta']);
    expect(list[1]).toMatchObject({ projectCount: 2, trackedSeconds: 5400 });
  });

  it('deleting a client keeps its projects (shown without a client) and restore brings it back', async () => {
    const client = await clientOf(alice(), 'Acme');
    const project = await projectOf(alice(), 'P', { clientId: client.id });
    expect(project.client).toEqual({ id: client.id, name: 'Acme' });
    const deleted = await run(alice(), 'clients.delete', { id: client.id });
    expect((await getProject(alice(), project.id)).client).toBeNull();
    expect(await statusCode(registry.run(alice(), 'clients.get', { id: client.id }))).toBe(404);
    expect((await run<Client[]>(alice(), 'clients.list', {})).data).toHaveLength(0);
    await doUndo(alice(), deleted);
    expect((await getProject(alice(), project.id)).client?.name).toBe('Acme');
    const again = await run(alice(), 'clients.restore', { id: client.id });
    expect(again.undo).toBeNull();
  });

  it('keeps clients private to their user', async () => {
    const client = await clientOf(alice(), 'Acme');
    expect(await statusCode(registry.run(bob(), 'clients.get', { id: client.id }))).toBe(404);
    expect(
      await statusCode(registry.run(bob(), 'clients.update', { id: client.id, name: 'X' })),
    ).toBe(404);
    expect(await statusCode(registry.run(bob(), 'clients.delete', { id: client.id }))).toBe(404);
    expect((await run<Client[]>(bob(), 'clients.list', {})).data).toEqual([]);
    expect(await statusCode(registry.run(bob(), 'projects.create', { title: 'P', clientId: client.id }))).toBe(404);
  });
});

describe('projects', () => {
  it('creates a project with the dates at the start of the India day, and undo deletes it', async () => {
    const created = await run<Project>(alice(), 'projects.create', {
      title: '  Site ',
      description: 'd',
      startAt: '2026-11-01T10:00:00.000Z',
      dueAt: '2026-12-31T10:00:00.000Z',
      color: '#7C9CF5',
    });
    expect(created.data).toMatchObject({
      title: 'Site',
      description: 'd',
      status: 'active',
      color: '#7C9CF5',
      startAt: '2026-10-31T18:30:00.000Z',
      dueAt: '2026-12-30T18:30:00.000Z',
      client: null,
      progress: { done: 0, total: 0 },
      milestones: { done: 0, total: 0 },
      noteCount: 0,
      trackedSeconds: 0,
    });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, created.data.id));
    expect(entity).toMatchObject({ type: 'project', title: 'Site' });
    await doUndo(alice(), created);
    expect(await statusCode(registry.run(alice(), 'projects.get', { id: created.data.id }))).toBe(
      404,
    );
  });

  it('rejects bad input and a missing client', async () => {
    await expect(registry.run(alice(), 'projects.create', { title: '' })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      registry.run(alice(), 'projects.create', { title: 'x', color: 'red' }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(
      await statusCode(registry.run(alice(), 'projects.create', { title: 'x', clientId: MISSING })),
    ).toBe(404);
  });

  it('updates and undoes, including client and dates', async () => {
    const client = await clientOf(alice(), 'Acme');
    const project = await projectOf(alice(), 'A', { dueAt: '2026-12-31T10:00:00.000Z' });
    const updated = await run<Project>(alice(), 'projects.update', {
      id: project.id,
      title: 'B',
      clientId: client.id,
      dueAt: null,
    });
    expect(updated.data).toMatchObject({ title: 'B', dueAt: null, client: { name: 'Acme' } });
    const [entity] = await t.db.select().from(entities).where(eq(entities.id, project.id));
    expect(entity?.title).toBe('B');
    await doUndo(alice(), updated);
    expect(await getProject(alice(), project.id)).toMatchObject({
      title: 'A',
      client: null,
      dueAt: '2026-12-30T18:30:00.000Z',
    });
    const noChange = await run(alice(), 'projects.update', { id: project.id, title: 'A' });
    expect(noChange.undo).toBeNull();
  });

  it('sets the status with an undo, and lists by status and client', async () => {
    const client = await clientOf(alice(), 'Acme');
    const a = await projectOf(alice(), 'A', { clientId: client.id });
    const b = await projectOf(alice(), 'B');
    const set = await run<Project>(alice(), 'projects.setStatus', { id: a.id, status: 'done' });
    expect(set.data.status).toBe('done');
    expect((await run<Project[]>(alice(), 'projects.list', {})).data.map((p) => p.id)).toEqual([
      b.id,
      a.id,
    ]);
    expect(
      (await run<Project[]>(alice(), 'projects.list', { status: 'done' })).data.map((p) => p.id),
    ).toEqual([a.id]);
    expect(
      (await run<Project[]>(alice(), 'projects.list', { clientId: client.id })).data.map(
        (p) => p.id,
      ),
    ).toEqual([a.id]);
    await doUndo(alice(), set);
    expect((await getProject(alice(), a.id)).status).toBe('active');
    expect((await run(alice(), 'projects.setStatus', { id: a.id, status: 'active' })).undo).toBeNull();
  });

  it('deletes and restores', async () => {
    const project = await projectOf(alice(), 'A');
    const deleted = await run(alice(), 'projects.delete', { id: project.id });
    expect(await statusCode(registry.run(alice(), 'projects.get', { id: project.id }))).toBe(404);
    expect((await run<Project[]>(alice(), 'projects.list', {})).data).toHaveLength(0);
    const restored = await doUndo(alice(), deleted);
    expect((restored.data as Project).id).toBe(project.id);
    expect(await getProject(alice(), project.id)).toMatchObject({ title: 'A' });
    expect(undoOf(restored)).toEqual({ action: 'projects.delete', input: { id: project.id } });
  });

  it('keeps projects private to their user', async () => {
    const project = await projectOf(alice(), 'A');
    const task = await taskOf(bob(), 'T');
    for (const [name, input] of [
      ['projects.get', { id: project.id }],
      ['projects.items', { id: project.id }],
      ['projects.update', { id: project.id, title: 'X' }],
      ['projects.setStatus', { id: project.id, status: 'done' }],
      ['projects.delete', { id: project.id }],
      ['projects.restore', { id: project.id }],
      ['projects.setTaskProject', { taskId: task.id, projectId: project.id }],
    ] as const) {
      expect(await statusCode(registry.run(bob(), name, input))).toBe(404);
    }
    expect((await run<Project[]>(bob(), 'projects.list', {})).data).toEqual([]);
  });
});

describe('project items', () => {
  it('puts tasks and notes in a project, counts progress, lists items, and undoes', async () => {
    const project = await projectOf(alice(), 'P');
    const open = await taskOf(alice(), 'Open');
    const done = await taskOf(alice(), 'Done');
    await run(alice(), 'tasks.complete', { id: done.id });
    const note = await noteOf(alice(), 'Spec');

    const first = await run<Project>(alice(), 'projects.setTaskProject', {
      taskId: open.id,
      projectId: project.id,
    });
    expect(first.data.progress).toEqual({ done: 0, total: 1 });
    await run(alice(), 'projects.setTaskProject', { taskId: done.id, projectId: project.id });
    const withNote = await run<Project>(alice(), 'projects.setNoteProject', {
      noteId: note.id,
      projectId: project.id,
    });
    expect(withNote.data).toMatchObject({ progress: { done: 1, total: 2 }, noteCount: 1 });
    expect(await taskProjectOf(alice(), open.id)).toEqual({ id: project.id, title: 'P' });

    const items = await itemsOf(alice(), project.id);
    expect(items.tasks.map((task) => task.title)).toEqual(['Open', 'Done']);
    expect(items.notes).toMatchObject([{ id: note.id, title: 'Spec' }]);

    // Same project again changes nothing
    const same = await run(alice(), 'projects.setTaskProject', {
      taskId: open.id,
      projectId: project.id,
    });
    expect(same.undo).toBeNull();

    // Take the note out, then undo puts it back
    const out = await run<Project>(alice(), 'projects.setNoteProject', {
      noteId: note.id,
      projectId: null,
    });
    expect(out.data.noteCount).toBe(0);
    await doUndo(alice(), out);
    expect((await getProject(alice(), project.id)).noteCount).toBe(1);

    // Undo of the first link takes the task out again
    await doUndo(alice(), first);
    expect(await taskProjectOf(alice(), open.id)).toBeNull();
  });

  it('moves a task between projects and undoes the move', async () => {
    const a = await projectOf(alice(), 'A');
    const b = await projectOf(alice(), 'B');
    const task = await taskOf(alice(), 'T');
    await run(alice(), 'projects.setTaskProject', { taskId: task.id, projectId: a.id });
    const moved = await run<Project>(alice(), 'projects.setTaskProject', {
      taskId: task.id,
      projectId: b.id,
    });
    expect(moved.data.progress.total).toBe(1);
    expect((await getProject(alice(), a.id)).progress.total).toBe(0);
    expect((await taskProjectOf(alice(), task.id))?.id).toBe(b.id);
    await doUndo(alice(), moved);
    expect((await taskProjectOf(alice(), task.id))?.id).toBe(a.id);
    expect((await getProject(alice(), b.id)).progress.total).toBe(0);
  });

  it('lets a task be in a goal and a project, and never mixes their progress', async () => {
    const project = await projectOf(alice(), 'P');
    const goal = (await run<{ id: string }>(alice(), 'goals.create', { title: 'G' })).data;
    const task = await taskOf(alice(), 'T');
    await run(alice(), 'goals.setTaskGoal', { taskId: task.id, goalId: goal.id });
    await run(alice(), 'projects.setTaskProject', { taskId: task.id, projectId: project.id });
    expect((await getProject(alice(), project.id)).progress.total).toBe(1);
    const goalNow = (await run<{ progress: { total: number } }>(alice(), 'goals.get', { id: goal.id }))
      .data;
    expect(goalNow.progress.total).toBe(1);
    const full = (await run<Task>(alice(), 'tasks.get', { id: task.id })).data;
    expect(full.goal?.id).toBe(goal.id);
    // Moving the task to another goal does not touch the project link
    const other = (await run<{ id: string }>(alice(), 'goals.create', { title: 'G2' })).data;
    await run(alice(), 'goals.setTaskGoal', { taskId: task.id, goalId: other.id });
    expect((await taskProjectOf(alice(), task.id))?.id).toBe(project.id);
  });

  it('validates the task, the note and the project', async () => {
    const project = await projectOf(alice(), 'P');
    const parent = await taskOf(alice(), 'Parent');
    const sub = await taskOf(alice(), 'Sub', { parentTaskId: parent.id });
    expect(
      await statusCode(
        registry.run(alice(), 'projects.setTaskProject', { taskId: sub.id, projectId: project.id }),
      ),
    ).toBe(400);
    expect(
      await statusCode(
        registry.run(alice(), 'projects.setTaskProject', { taskId: MISSING, projectId: project.id }),
      ),
    ).toBe(404);
    expect(
      await statusCode(
        registry.run(alice(), 'projects.setNoteProject', { noteId: MISSING, projectId: project.id }),
      ),
    ).toBe(404);
    expect(
      await statusCode(
        registry.run(alice(), 'projects.setTaskProject', { taskId: parent.id, projectId: MISSING }),
      ),
    ).toBe(404);
    // Taking out a task that is in no project
    expect(
      await statusCode(
        registry.run(alice(), 'projects.setTaskProject', { taskId: parent.id, projectId: null }),
      ),
    ).toBe(404);
    // A goal id is not a project
    const goal = (await run<{ id: string }>(alice(), 'goals.create', { title: 'G' })).data;
    expect(
      await statusCode(
        registry.run(alice(), 'projects.setTaskProject', { taskId: parent.id, projectId: goal.id }),
      ),
    ).toBe(404);
    expect(await statusCode(registry.run(alice(), 'projects.taskProject', { taskId: MISSING }))).toBe(
      404,
    );
  });

  it('stops at 500 items with project_full', async () => {
    const project = await projectOf(alice(), 'P');
    const task = await taskOf(alice(), 'T');
    const rows = Array.from({ length: 500 }, (_, index) => ({
      id: crypto.randomUUID(),
      userId: ALICE,
      type: 'task' as const,
      title: `x${String(index)}`,
    }));
    await t.db.insert(entities).values(rows);
    await t.db.execute(
      sql`insert into tasks (id, user_id, title) select id, user_id, title from entities where title like 'x%'`,
    );
    await t.db
      .insert(links)
      .values(
        rows.map((row) => ({
          userId: ALICE,
          sourceId: row.id,
          targetId: project.id,
          relation: 'belongs_to' as const,
        })),
      );
    try {
      await run(alice(), 'projects.setTaskProject', { taskId: task.id, projectId: project.id });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe('project_full');
      expect((error as HttpError).statusCode).toBe(409);
    }
  });

  it('keeps links when a project is deleted; restore brings the items back, not stale links', async () => {
    const a = await projectOf(alice(), 'A');
    const b = await projectOf(alice(), 'B');
    const task = await taskOf(alice(), 'T');
    const kept = await taskOf(alice(), 'K');
    await run(alice(), 'projects.setTaskProject', { taskId: task.id, projectId: a.id });
    await run(alice(), 'projects.setTaskProject', { taskId: kept.id, projectId: a.id });
    const deleted = await run(alice(), 'projects.delete', { id: a.id });
    expect(await taskProjectOf(alice(), task.id)).toBeNull();
    // While A is deleted, the task moves to B
    await run(alice(), 'projects.setTaskProject', { taskId: task.id, projectId: b.id });
    await doUndo(alice(), deleted);
    expect((await taskProjectOf(alice(), task.id))?.id).toBe(b.id);
    expect((await taskProjectOf(alice(), kept.id))?.id).toBe(a.id);
    expect((await getProject(alice(), a.id)).progress.total).toBe(1);
  });

  it('does not count archived open tasks in progress but lists them in items', async () => {
    const project = await projectOf(alice(), 'P');
    const task = await taskOf(alice(), 'T');
    await run(alice(), 'projects.setTaskProject', { taskId: task.id, projectId: project.id });
    await run(alice(), 'tasks.archive', { id: task.id });
    expect((await getProject(alice(), project.id)).progress.total).toBe(0);
    expect((await itemsOf(alice(), project.id)).tasks).toHaveLength(1);
  });
});

describe('milestones', () => {
  it('creates in order, updates, marks done, deletes and restores', async () => {
    const project = await projectOf(alice(), 'P');
    const first = await run<Milestone>(alice(), 'milestones.create', {
      projectId: project.id,
      title: 'One',
      dueAt: '2026-12-31T10:00:00.000Z',
    });
    const second = await run<Milestone>(alice(), 'milestones.create', {
      projectId: project.id,
      title: 'Two',
    });
    expect(first.data).toMatchObject({ title: 'One', dueAt: '2026-12-30T18:30:00.000Z', doneAt: null });
    expect(second.data.position).toBeGreaterThan(first.data.position);
    expect(
      (await run<Milestone[]>(alice(), 'milestones.list', { projectId: project.id })).data.map(
        (m) => m.title,
      ),
    ).toEqual(['One', 'Two']);

    const done = await run<Milestone>(alice(), 'milestones.update', {
      id: first.data.id,
      done: true,
      title: 'Uno',
    });
    expect(done.data.doneAt).not.toBeNull();
    expect(done.data.title).toBe('Uno');
    expect((await getProject(alice(), project.id)).milestones).toEqual({ done: 1, total: 2 });
    await doUndo(alice(), done);
    expect(
      (await run<Milestone[]>(alice(), 'milestones.list', { projectId: project.id })).data[0],
    ).toMatchObject({ title: 'One', doneAt: null });
    const noChange = await run(alice(), 'milestones.update', { id: first.data.id, done: false });
    expect(noChange.undo).toBeNull();

    const deleted = await run(alice(), 'milestones.delete', { id: second.data.id });
    expect(
      (await run<Milestone[]>(alice(), 'milestones.list', { projectId: project.id })).data,
    ).toHaveLength(1);
    await doUndo(alice(), deleted);
    expect(
      (await run<Milestone[]>(alice(), 'milestones.list', { projectId: project.id })).data,
    ).toHaveLength(2);
    await doUndo(alice(), first);
    expect(await statusCode(registry.run(alice(), 'milestones.update', { id: first.data.id, title: 'x' }))).toBe(404);
  });

  it('validates and keeps milestones private', async () => {
    const project = await projectOf(alice(), 'P');
    const milestone = (
      await run<Milestone>(alice(), 'milestones.create', { projectId: project.id, title: 'M' })
    ).data;
    await expect(
      registry.run(alice(), 'milestones.create', { projectId: project.id, title: ' ' }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(
      await statusCode(registry.run(alice(), 'milestones.create', { projectId: MISSING, title: 'x' })),
    ).toBe(404);
    expect(await statusCode(registry.run(bob(), 'milestones.list', { projectId: project.id }))).toBe(
      404,
    );
    for (const name of ['milestones.delete', 'milestones.restore']) {
      expect(await statusCode(registry.run(bob(), name, { id: milestone.id }))).toBe(404);
    }
    expect(
      await statusCode(registry.run(bob(), 'milestones.update', { id: milestone.id, done: true })),
    ).toBe(404);
  });
});

describe('time tracking', () => {
  it('starts a timer, shows it as running, and the undo deletes it', async () => {
    const project = await projectOf(alice(), 'P');
    const task = await taskOf(alice(), 'T');
    const started = await run<TimeEntry>(alice(), 'time.start', {
      projectId: project.id,
      taskId: task.id,
      note: ' work ',
    });
    expect(started.data).toMatchObject({
      projectId: project.id,
      projectTitle: 'P',
      taskId: task.id,
      taskTitle: 'T',
      endedAt: null,
      note: 'work',
    });
    const running = (await run<TimeEntry | null>(alice(), 'time.running', {})).data;
    expect(running?.id).toBe(started.data.id);
    await doUndo(alice(), started);
    expect((await run<TimeEntry | null>(alice(), 'time.running', {})).data).toBeNull();
    expect((await run<TimeEntry[]>(alice(), 'time.list', {})).data).toHaveLength(0);
  });

  it('starting a second timer stops the first; stop finishes the running one (no undo)', async () => {
    const a = await projectOf(alice(), 'A');
    const b = await projectOf(alice(), 'B');
    const first = await run<TimeEntry>(alice(), 'time.start', { projectId: a.id });
    const second = await run<TimeEntry>(alice(), 'time.start', { projectId: b.id });
    const list = (await run<TimeEntry[]>(alice(), 'time.list', {})).data;
    expect(list.find((e) => e.id === first.data.id)?.endedAt).not.toBeNull();
    expect((await run<TimeEntry | null>(alice(), 'time.running', {})).data?.id).toBe(
      second.data.id,
    );
    const stopped = await run<TimeEntry>(alice(), 'time.stop', {});
    expect(stopped.data.id).toBe(second.data.id);
    expect(stopped.data.endedAt).not.toBeNull();
    expect(stopped.undo ?? null).toBeNull();
    expect(await statusCode(registry.run(alice(), 'time.stop', {}))).toBe(404);
    expect(await statusCode(registry.run(alice(), 'time.stop', { id: MISSING }))).toBe(404);
  });

  it('adds, updates (with undo), validates, deletes and restores entries', async () => {
    const project = await projectOf(alice(), 'P');
    const task = await taskOf(alice(), 'T');
    const added = await run<TimeEntry>(alice(), 'time.add', {
      projectId: project.id,
      startedAt: '2026-10-01T10:00:00.000Z',
      endedAt: '2026-10-01T11:00:00.000Z',
      note: 'x',
    });
    expect(added.data.seconds).toBe(3600);
    const updated = await run<TimeEntry>(alice(), 'time.update', {
      id: added.data.id,
      endedAt: '2026-10-01T12:00:00.000Z',
      taskId: task.id,
      note: '',
    });
    expect(updated.data).toMatchObject({ seconds: 7200, taskId: task.id, note: null });
    await doUndo(alice(), updated);
    expect(
      (await run<TimeEntry[]>(alice(), 'time.list', {})).data[0],
    ).toMatchObject({ seconds: 3600, taskId: null, note: 'x' });

    expect(
      await statusCode(
        registry.run(alice(), 'time.update', { id: added.data.id, endedAt: '2026-10-01T09:00:00.000Z' }),
      ),
    ).toBe(400);
    expect(
      await statusCode(
        registry.run(alice(), 'time.update', { id: added.data.id, endedAt: '2026-10-03T10:00:00.000Z' }),
      ),
    ).toBe(400);
    expect(
      await statusCode(registry.run(alice(), 'time.update', { id: added.data.id, taskId: MISSING })),
    ).toBe(404);
    await expect(
      registry.run(alice(), 'time.add', {
        projectId: project.id,
        startedAt: '2026-10-01T10:00:00.000Z',
        endedAt: '2026-10-03T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(
      await statusCode(
        registry.run(alice(), 'time.add', {
          projectId: MISSING,
          startedAt: '2026-10-01T10:00:00.000Z',
          endedAt: '2026-10-01T11:00:00.000Z',
        }),
      ),
    ).toBe(404);

    const deleted = await run(alice(), 'time.delete', { id: added.data.id });
    expect((await run<TimeEntry[]>(alice(), 'time.list', {})).data).toHaveLength(0);
    await doUndo(alice(), deleted);
    expect((await run<TimeEntry[]>(alice(), 'time.list', {})).data).toHaveLength(1);
    await doUndo(alice(), added);
    expect((await run<TimeEntry[]>(alice(), 'time.list', {})).data).toHaveLength(0);
  });

  it('does not let a running entry get an end through update, and restore refuses a second timer', async () => {
    const project = await projectOf(alice(), 'P');
    const started = await run<TimeEntry>(alice(), 'time.start', { projectId: project.id });
    expect(
      await statusCode(
        registry.run(alice(), 'time.update', { id: started.data.id, endedAt: new Date().toISOString() }),
      ),
    ).toBe(400);
    const deleted = await run(alice(), 'time.delete', { id: started.data.id });
    await run(alice(), 'time.start', { projectId: project.id });
    expect(await statusCode(registry.run(alice(), 'time.restore', { id: started.data.id }))).toBe(
      409,
    );
    expect(deleted.undo).toBeTruthy();
  });

  it('filters the list and hides entries of a deleted project', async () => {
    const a = await projectOf(alice(), 'A');
    const b = await projectOf(alice(), 'B');
    const add = (projectId: string, start: string, end: string) =>
      run(alice(), 'time.add', { projectId, startedAt: start, endedAt: end });
    await add(a.id, '2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z');
    await add(b.id, '2026-10-02T10:00:00.000Z', '2026-10-02T11:00:00.000Z');
    const all = (await run<TimeEntry[]>(alice(), 'time.list', {})).data;
    expect(all.map((e) => e.projectTitle)).toEqual(['B', 'A']);
    expect((await run<TimeEntry[]>(alice(), 'time.list', { projectId: a.id })).data).toHaveLength(1);
    expect(
      (await run<TimeEntry[]>(alice(), 'time.list', { from: '2026-10-02T00:00:00.000Z' })).data,
    ).toHaveLength(1);
    expect((await run<TimeEntry[]>(alice(), 'time.list', { limit: 1 })).data).toHaveLength(1);
    const deleted = await run(alice(), 'projects.delete', { id: b.id });
    expect((await run<TimeEntry[]>(alice(), 'time.list', {})).data).toHaveLength(1);
    await doUndo(alice(), deleted);
    expect((await run<TimeEntry[]>(alice(), 'time.list', {})).data).toHaveLength(2);
  });

  it('counts a running timer in the project tracked seconds', async () => {
    const project = await projectOf(alice(), 'P');
    const started = await run<TimeEntry>(alice(), 'time.start', { projectId: project.id });
    await t.db
      .update(timeEntries)
      .set({ startedAt: new Date(Date.now() - 600_000) })
      .where(eq(timeEntries.id, started.data.id));
    const seconds = (await getProject(alice(), project.id)).trackedSeconds;
    expect(seconds).toBeGreaterThanOrEqual(600);
    expect(seconds).toBeLessThan(620);
  });

  it('summarises by project and by India week (Monday start), with zero weeks', async () => {
    const a = await projectOf(alice(), 'A');
    const b = await projectOf(alice(), 'B');
    const now = new Date();
    const weekStart = (await run<TimeSummary>(alice(), 'time.summary', { weeks: 3 })).data.byWeek;
    expect(weekStart).toHaveLength(3);
    // The last week starts on a Monday 00:00 India time: 18:30 UTC on Sunday
    const last = new Date(weekStart[2]?.weekStart ?? '');
    expect(last.getUTCDay()).toBe(0);
    expect(last.getUTCHours()).toBe(18);
    expect(last.getUTCMinutes()).toBe(30);
    expect(last.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - last.getTime()).toBeLessThan(7 * 86_400_000);

    const lastStart = last.getTime();
    const hours = (n: number) => n * 3_600_000;
    const add = (projectId: string, start: number, length: number) =>
      run(alice(), 'time.add', {
        projectId,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(start + length).toISOString(),
      });
    await add(a.id, lastStart + hours(1), hours(2));
    await add(b.id, lastStart + hours(5), hours(1));
    await add(a.id, lastStart - 14 * 86_400_000 + hours(1), hours(3));
    // Just before the first week of the window: not counted
    await add(a.id, lastStart - 15 * 86_400_000, hours(1));

    const summary = (await run<TimeSummary>(alice(), 'time.summary', { weeks: 3 })).data;
    expect(summary.byWeek.map((w) => w.seconds)).toEqual([10800, 0, 10800]);
    expect(summary.totalSeconds).toBe(21600);
    expect(summary.byProject).toEqual([
      { projectId: a.id, title: 'A', seconds: 18000 },
      { projectId: b.id, title: 'B', seconds: 3600 },
    ]);
    const onlyB = (await run<TimeSummary>(alice(), 'time.summary', { projectId: b.id, weeks: 3 }))
      .data;
    expect(onlyB.totalSeconds).toBe(3600);
  });

  it('keeps time entries private to their user', async () => {
    const project = await projectOf(alice(), 'P');
    const entry = await run<TimeEntry>(alice(), 'time.start', { projectId: project.id });
    expect(await statusCode(registry.run(bob(), 'time.start', { projectId: project.id }))).toBe(404);
    expect((await run<TimeEntry[]>(bob(), 'time.list', {})).data).toEqual([]);
    expect((await run<TimeEntry | null>(bob(), 'time.running', {})).data).toBeNull();
    expect((await run<TimeSummary>(bob(), 'time.summary', {})).data.totalSeconds).toBe(0);
    for (const name of ['time.update', 'time.delete', 'time.restore']) {
      expect(await statusCode(registry.run(bob(), name, { id: entry.data.id, note: 'x' }))).toBe(404);
    }
    expect(await statusCode(registry.run(bob(), 'time.stop', { id: entry.data.id }))).toBe(404);
    // Bob can run his own timer at the same time
    const bobProject = await projectOf(bob(), 'B');
    await run(bob(), 'time.start', { projectId: bobProject.id });
    expect((await run<TimeEntry | null>(alice(), 'time.running', {})).data?.id).toBe(entry.data.id);
  });
});
