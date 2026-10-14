import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOT_HANDLED } from './fake-modules';
import {
  createProjectsFake,
  currentProjectsFake,
  makeClient,
  makeMilestone,
  makeProject,
  makeTimeEntry,
} from './fake-projects';
import { makeTask } from './fake-api';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 3 PM on Tuesday 7 October 2025 in India
  vi.setSystemTime(new Date('2025-10-07T09:30:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const call = (
  fake: ReturnType<typeof createProjectsFake>,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
) => fake.handle(method, path, { body, query }) as { item?: unknown; items?: unknown[]; undo?: unknown };

describe('the Projects mock API', () => {
  it('leaves routes of other modules alone', () => {
    const fake = createProjectsFake();
    expect(fake.handle('GET', '/tasks', {})).toBe(NOT_HANDLED);
    expect(fake.handle('POST', '/undo', { body: { action: 'tasks.restore', input: {} } })).toBe(
      NOT_HANDLED,
    );
  });

  it('is the one currentProjectsFake() returns', () => {
    const fake = createProjectsFake();
    expect(currentProjectsFake()).toBe(fake);
  });

  it('works out progress from the linked tasks like the server (archived and not done are skipped)', () => {
    const fake = createProjectsFake();
    const project = makeProject();
    fake.seed({
      projects: [project],
      tasks: [
        { task: makeTask({ status: 'done' }), projectId: project.id },
        { task: makeTask(), projectId: project.id },
        { task: makeTask({ archivedAt: '2025-10-01T00:00:00.000Z' }), projectId: project.id },
        {
          task: makeTask({ status: 'done', archivedAt: '2025-10-01T00:00:00.000Z' }),
          projectId: project.id,
        },
      ],
    });
    expect(fake.projects()[0]?.progress).toEqual({ done: 2, total: 3 });
  });

  it('follows status changes made through the tasks routes', () => {
    const fake = createProjectsFake();
    const project = makeProject();
    const task = makeTask();
    fake.seed({ projects: [project], tasks: [{ task, projectId: project.id }] });
    expect(fake.handle('POST', `/tasks/${task.id}/move`, { body: { status: 'doing' } })).toBe(
      NOT_HANDLED,
    );
    expect(call(fake, 'GET', `/projects/${project.id}/items`).item).toMatchObject({
      tasks: [{ id: task.id, status: 'doing' }],
    });
    fake.handle('POST', `/tasks/${task.id}/complete`, {});
    expect(fake.projects()[0]?.progress).toEqual({ done: 1, total: 1 });
    fake.handle('DELETE', `/tasks/${task.id}`, {});
    expect(fake.projects()[0]?.progress).toEqual({ done: 0, total: 0 });
  });

  it('keeps a client name on its projects and counts its projects and hours', () => {
    const fake = createProjectsFake();
    const client = makeClient({ name: 'Acme' });
    const project = makeProject({ client: { id: client.id, name: 'Acme' } });
    fake.seed({
      clients: [client],
      projects: [project],
      entries: [makeTimeEntry(project.id)],
    });
    expect(fake.clients()[0]).toMatchObject({ projectCount: 1, trackedSeconds: 3600 });
    call(fake, 'DELETE', `/clients/${client.id}`);
    expect(fake.projects()[0]?.client).toBeNull();
  });

  it('creates, changes and deletes a project with undo descriptors', () => {
    const fake = createProjectsFake();
    const created = call(fake, 'POST', '/projects', { title: ' Site ' });
    const project = created.item as { id: string; title: string };
    expect(project.title).toBe('Site');
    expect(created.undo).toEqual({ action: 'projects.delete', input: { id: project.id } });

    const changed = call(fake, 'POST', `/projects/${project.id}/status`, { status: 'done' });
    expect(changed.undo).toEqual({
      action: 'projects.update',
      input: { id: project.id, status: 'active' },
    });

    const removed = call(fake, 'DELETE', `/projects/${project.id}`);
    expect(fake.projects()).toHaveLength(0);
    fake.handle('POST', '/undo', { body: removed.undo });
    expect(fake.projects()).toHaveLength(1);
  });

  it('rejects an empty title and an unknown project', () => {
    const fake = createProjectsFake();
    expect(() => call(fake, 'POST', '/projects', { title: ' ' })).toThrow('Title is required');
    expect(() => call(fake, 'GET', '/projects/nope')).toThrow('Project not found');
  });

  it('ticks a milestone done and open again', () => {
    const fake = createProjectsFake();
    const project = makeProject();
    const milestone = makeMilestone(project.id);
    fake.seed({ projects: [project], milestones: [milestone] });
    call(fake, 'PATCH', `/milestones/${milestone.id}`, { done: true });
    expect(fake.projects()[0]?.milestones).toEqual({ done: 1, total: 1 });
    call(fake, 'PATCH', `/milestones/${milestone.id}`, { done: false });
    expect(fake.milestones()[0]?.doneAt).toBeNull();
  });

  it('links a task to one project at a time and reports it', () => {
    const fake = createProjectsFake();
    const one = makeProject({ title: 'One' });
    const two = makeProject({ title: 'Two' });
    const task = makeTask();
    fake.seed({ projects: [one, two], tasks: [{ task, projectId: one.id }] });
    expect(call(fake, 'GET', `/tasks/${task.id}/project`).item).toEqual({ id: one.id, title: 'One' });
    const moved = call(fake, 'PUT', `/tasks/${task.id}/project`, { projectId: two.id });
    expect(fake.taskProjectOf(task.id)).toBe(two.id);
    expect(moved.undo).toEqual({
      action: 'projects.setTaskProject',
      input: { taskId: task.id, projectId: one.id },
    });
    call(fake, 'PUT', `/tasks/${task.id}/project`, { projectId: null });
    expect(call(fake, 'GET', `/tasks/${task.id}/project`).item).toBeNull();
  });

  it('runs one timer at a time and stops it', () => {
    const fake = createProjectsFake();
    const one = makeProject();
    const two = makeProject();
    fake.seed({ projects: [one, two] });
    call(fake, 'POST', '/time-entries/start', { projectId: one.id });
    vi.setSystemTime(new Date('2025-10-07T09:31:30.000Z'));
    expect((call(fake, 'GET', '/time-entries/running').item as { seconds: number }).seconds).toBe(90);
    call(fake, 'POST', '/time-entries/start', { projectId: two.id });
    expect(fake.entries().filter((entry) => entry.endedAt === null)).toHaveLength(1);
    expect(fake.entries().find((entry) => entry.projectId === one.id)?.seconds).toBe(90);
    call(fake, 'POST', '/time-entries/stop', {});
    expect(call(fake, 'GET', '/time-entries/running').item).toBeNull();
    expect(() => call(fake, 'POST', '/time-entries/stop', {})).toThrow('No timer is running');
  });

  it('rejects an entry that ends before it starts or is longer than 24 hours', () => {
    const fake = createProjectsFake();
    const project = makeProject();
    fake.seed({ projects: [project] });
    expect(() =>
      call(fake, 'POST', '/time-entries', {
        projectId: project.id,
        startedAt: '2025-10-07T10:00:00.000Z',
        endedAt: '2025-10-07T09:00:00.000Z',
      }),
    ).toThrow('The end must be after the start');
    expect(() =>
      call(fake, 'POST', '/time-entries', {
        projectId: project.id,
        startedAt: '2025-10-05T10:00:00.000Z',
        endedAt: '2025-10-07T09:00:00.000Z',
      }),
    ).toThrow('at most 24 hours');
  });

  it('sums time per project and per India week (Monday start, newest last)', () => {
    const fake = createProjectsFake();
    const one = makeProject({ title: 'One' });
    const two = makeProject({ title: 'Two' });
    fake.seed({
      projects: [one, two],
      entries: [
        // Monday 6 Oct 2025, 09:30 India
        makeTimeEntry(one.id, {
          startedAt: '2025-10-06T04:00:00.000Z',
          endedAt: '2025-10-06T05:00:00.000Z',
        }),
        // The Sunday before (5 Oct, 23:00 India): the previous week
        makeTimeEntry(two.id, {
          startedAt: '2025-10-05T17:30:00.000Z',
          endedAt: '2025-10-05T18:00:00.000Z',
        }),
      ],
    });
    const { item } = call(fake, 'GET', '/time-entries/summary', undefined, { weeks: '2' });
    expect(item).toEqual({
      totalSeconds: 5400,
      byProject: [
        { projectId: one.id, title: 'One', seconds: 3600 },
        { projectId: two.id, title: 'Two', seconds: 1800 },
      ],
      byWeek: [
        { weekStart: '2025-09-28T18:30:00.000Z', seconds: 1800 },
        { weekStart: '2025-10-05T18:30:00.000Z', seconds: 3600 },
      ],
    });
  });
});
