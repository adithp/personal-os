import type {
  Client,
  Milestone,
  Project,
  ProjectNote,
  ProjectStatus,
  Task,
  TimeEntry,
  TimeSummary,
} from '@personal-os/shared';
import { ApiError, type RequestOptions } from '../api/api-client';
import { NOT_HANDLED } from './fake-modules';

/**
 * Projects lane: the mock API of this lane's routes (clients, projects, milestones, linked tasks
 * and notes, time entries) with the real routes' rules in memory. Any other path answers NOT_HANDLED.
 *
 * createFakeApi() builds one of these inside; get it with `currentProjectsFake()` right after
 * `createFakeApi(...)` and fill it with `seed(...)`. The mock keeps its own copy of the tasks that
 * are linked to projects (give it the same tasks as createFakeApi); it follows status changes and
 * deletes the tasks routes make, so the board and progress stay in step.
 */

let counter = 700_000;
const idFor = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const NOW = '2025-10-01T00:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = (5 * 60 + 30) * 60 * 1000;

export function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: idFor(),
    name: `Client ${String(counter)}`,
    email: null,
    phone: null,
    company: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    projectCount: 0,
    trackedSeconds: 0,
    ...overrides,
  };
}

/** A project with defaults; progress, milestones, noteCount and trackedSeconds are worked out by the mock. */
export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: idFor(),
    title: `Project ${String(counter)}`,
    description: null,
    status: 'active',
    color: null,
    startAt: null,
    dueAt: null,
    client: null,
    createdAt: NOW,
    updatedAt: NOW,
    progress: { done: 0, total: 0 },
    milestones: { done: 0, total: 0 },
    noteCount: 0,
    trackedSeconds: 0,
    ...overrides,
  };
}

export function makeMilestone(projectId: string, overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: idFor(),
    projectId,
    title: `Milestone ${String(counter)}`,
    dueAt: null,
    doneAt: null,
    position: counter,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A finished one-hour time entry unless overridden; `seconds` is worked out by the mock. */
export function makeTimeEntry(projectId: string, overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: idFor(),
    projectId,
    projectTitle: '',
    taskId: null,
    taskTitle: null,
    startedAt: '2025-10-06T04:00:00.000Z',
    endedAt: '2025-10-06T05:00:00.000Z',
    seconds: 3600,
    note: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function makeProjectNote(overrides: Partial<ProjectNote> = {}): ProjectNote {
  return { id: idFor(), title: `Note ${String(counter)}`, updatedAt: NOW, ...overrides };
}

export interface ProjectsSeed {
  clients?: Client[];
  projects?: Project[];
  milestones?: Milestone[];
  entries?: TimeEntry[];
  /** Tasks that exist (give createFakeApi the same ones) and the project each belongs to. */
  tasks?: { task: Task; projectId: string }[];
  notes?: { note: ProjectNote; projectId: string }[];
}

type Undo = { action: string; input: Record<string, unknown> } | null;

const asRecord = (value: unknown): Record<string, unknown> =>
  (value ?? {}) as Record<string, unknown>;

export interface ProjectsFake {
  handle: (method: string, path: string, options: RequestOptions) => unknown;
  seed: (data: ProjectsSeed) => void;
  /** Live state for assertions. */
  clients: () => Client[];
  projects: () => Project[];
  milestones: () => Milestone[];
  entries: () => TimeEntry[];
  taskProjectOf: (taskId: string) => string | null;
  noteProjectOf: (noteId: string) => string | null;
}

export function createProjectsFake(): ProjectsFake {
  const clients = new Map<string, Client>();
  const projects = new Map<string, Project>();
  const milestones = new Map<string, Milestone>();
  const entries = new Map<string, TimeEntry>();
  const taskCopies = new Map<string, Task>();
  const noteCopies = new Map<string, ProjectNote>();
  const taskProject = new Map<string, string>();
  const noteProject = new Map<string, string>();
  /** Ids deleted (soft), per kind, for the undo. */
  const gone = new Set<string>();
  let lastCreatedTitle = 'New task';

  const live = <T extends { id: string }>(map: Map<string, T>) =>
    [...map.values()].filter((item) => !gone.has(item.id));
  const find = <T extends { id: string }>(map: Map<string, T>, id: string, what: string): T => {
    const item = map.get(id);
    if (!item || gone.has(id)) throw new ApiError(404, 'not_found', `${what} not found`);
    return item;
  };

  const secondsOf = (entry: TimeEntry) =>
    Math.max(
      0,
      Math.floor(
        ((entry.endedAt ? Date.parse(entry.endedAt) : Date.now()) - Date.parse(entry.startedAt)) /
          1000,
      ),
    );
  const entryView = (entry: TimeEntry): TimeEntry => {
    const project = projects.get(entry.projectId);
    const task = entry.taskId ? taskCopies.get(entry.taskId) : undefined;
    return {
      ...entry,
      projectTitle: project?.title ?? entry.projectTitle,
      taskTitle: task?.title ?? entry.taskTitle,
      seconds: secondsOf(entry),
    };
  };
  const liveEntries = () =>
    live(entries)
      .filter((entry) => projects.has(entry.projectId) && !gone.has(entry.projectId))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const trackedOf = (projectIds: Set<string>) =>
    liveEntries()
      .filter((entry) => projectIds.has(entry.projectId))
      .reduce((sum, entry) => sum + secondsOf(entry), 0);

  const projectTasks = (projectId: string) =>
    [...taskProject.entries()]
      .filter(([, linked]) => linked === projectId)
      .flatMap(([taskId]) => {
        const task = taskCopies.get(taskId);
        return task && !gone.has(taskId) && task.parentTaskId === null ? [task] : [];
      });
  const projectNotes = (projectId: string) =>
    [...noteProject.entries()]
      .filter(([, linked]) => linked === projectId)
      .flatMap(([noteId]) => {
        const note = noteCopies.get(noteId);
        return note ? [note] : [];
      });

  const projectView = (project: Project): Project => {
    const counted = projectTasks(project.id).filter(
      (task) => task.archivedAt === null || task.status === 'done',
    );
    const own = live(milestones).filter((milestone) => milestone.projectId === project.id);
    const client = project.client ? clients.get(project.client.id) : undefined;
    return {
      ...project,
      client: client && !gone.has(client.id) ? { id: client.id, name: client.name } : null,
      progress: {
        done: counted.filter((task) => task.status === 'done').length,
        total: counted.length,
      },
      milestones: {
        done: own.filter((milestone) => milestone.doneAt !== null).length,
        total: own.length,
      },
      noteCount: projectNotes(project.id).length,
      trackedSeconds: trackedOf(new Set([project.id])),
    };
  };
  const clientView = (client: Client): Client => {
    const own = live(projects).filter((project) => project.client?.id === client.id);
    return {
      ...client,
      projectCount: own.length,
      trackedSeconds: trackedOf(new Set(own.map((project) => project.id))),
    };
  };

  const weekStart = (ms: number): number => {
    const day = Math.floor((ms + IST_MS) / DAY_MS);
    const monday = day - ((day + 3) % 7);
    return monday * DAY_MS - IST_MS;
  };

  const summary = (query: RequestOptions['query'] = {}): TimeSummary => {
    const projectId = query.projectId === undefined ? null : String(query.projectId);
    const weeks = query.weeks === undefined ? 8 : Number(query.weeks);
    const chosen = liveEntries().filter(
      (entry) => projectId === null || entry.projectId === projectId,
    );
    const thisWeek = weekStart(Date.now());
    const byWeek = Array.from({ length: weeks }, (_, index) => {
      const start = thisWeek - (weeks - 1 - index) * 7 * DAY_MS;
      return {
        weekStart: new Date(start).toISOString(),
        seconds: chosen
          .filter((entry) => weekStart(Date.parse(entry.startedAt)) === start)
          .reduce((sum, entry) => sum + secondsOf(entry), 0),
      };
    });
    const perProject = new Map<string, { title: string; seconds: number }>();
    for (const entry of chosen) {
      const row = perProject.get(entry.projectId) ?? {
        title: projects.get(entry.projectId)?.title ?? '',
        seconds: 0,
      };
      row.seconds += secondsOf(entry);
      perProject.set(entry.projectId, row);
    }
    return {
      totalSeconds: chosen.reduce((sum, entry) => sum + secondsOf(entry), 0),
      byProject: [...perProject.entries()]
        .map(([id, row]) => ({ projectId: id, ...row }))
        .sort((a, b) => b.seconds - a.seconds),
      byWeek,
    };
  };

  const stopRunning = (): TimeEntry | null => {
    const running = liveEntries().find((entry) => entry.endedAt === null);
    if (!running) return null;
    const stopped = { ...running, endedAt: new Date().toISOString() };
    entries.set(stopped.id, stopped);
    return stopped;
  };

  const touch = <T extends { updatedAt: string }>(item: T): T => ({
    ...item,
    updatedAt: new Date().toISOString(),
  });

  const result = <T>(item: T, undo: Undo = null) => ({ item, undo });

  /** The tasks routes belong to the main mock; here the linked copies follow their changes. */
  const followTasks = (method: string, path: string, body: Record<string, unknown>) => {
    const route = /^\/tasks\/([^/]+)(?:\/(complete|move))?$/.exec(path);
    if (method === 'POST' && path === '/tasks' && typeof body.title === 'string') {
      lastCreatedTitle = body.title;
      return;
    }
    if (!route) return;
    const id = route[1] ?? '';
    const copy = taskCopies.get(id);
    if (!copy) return;
    if (method === 'DELETE' && !route[2]) {
      gone.add(id);
    } else if (method === 'POST' && route[2] === 'complete') {
      taskCopies.set(id, { ...copy, status: 'done', completedAt: new Date().toISOString() });
    } else if ((method === 'PATCH' && !route[2]) || (method === 'POST' && route[2] === 'move')) {
      const status = body.status;
      if (status === 'todo' || status === 'doing' || status === 'done') {
        taskCopies.set(id, {
          ...copy,
          status,
          completedAt: status === 'done' ? new Date().toISOString() : null,
        });
      }
    }
  };

  /** Undo of this lane's actions (the main mock only knows the tasks ones). */
  const undo = (action: string, input: Record<string, unknown>): unknown => {
    const [kind, verb] = action.split('.');
    const id = typeof input.id === 'string' ? input.id : '';
    if (verb === 'restore') {
      gone.delete(id);
      return { item: { id }, undo: null };
    }
    if (verb === 'delete') {
      gone.add(id);
      return { item: { id }, undo: null };
    }
    const maps = { clients, projects, milestones, time: entries } as unknown as Record<
      string,
      Map<string, { id: string }> | undefined
    >;
    const map = maps[kind ?? ''];
    if (verb === 'update' && map) {
      const current = map.get(id);
      if (current) map.set(id, { ...current, ...input });
      return { item: { id }, undo: null };
    }
    if (action === 'projects.setTaskProject' && typeof input.taskId === 'string') {
      if (typeof input.projectId === 'string') taskProject.set(input.taskId, input.projectId);
      else taskProject.delete(input.taskId);
      return { item: { id: input.taskId }, undo: null };
    }
    if (action === 'projects.setNoteProject' && typeof input.noteId === 'string') {
      if (typeof input.projectId === 'string') noteProject.set(input.noteId, input.projectId);
      else noteProject.delete(input.noteId);
      return { item: { id: input.noteId }, undo: null };
    }
    return NOT_HANDLED;
  };

  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = asRecord(options.body);
    const query = options.query ?? {};

    followTasks(method, path, body);

    if (method === 'POST' && path === '/undo') {
      const action = typeof body.action === 'string' ? body.action : '';
      if (/^(clients|projects|milestones|time)\./.test(action)) {
        return undo(action, asRecord(body.input));
      }
      return NOT_HANDLED;
    }

    // ---- clients ----
    if (method === 'GET' && path === '/clients') {
      return {
        items: live(clients)
          .map(clientView)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }
    if (method === 'POST' && path === '/clients') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name === '') throw new ApiError(400, 'validation_error', 'Name is required');
      const client = makeClient({ ...(body as Partial<Client>), name });
      clients.set(client.id, client);
      return result(clientView(client), { action: 'clients.delete', input: { id: client.id } });
    }
    const oneClient = /^\/clients\/([^/]+)$/.exec(path);
    if (oneClient) {
      const id = oneClient[1] ?? '';
      if (method === 'GET') return { item: clientView(find(clients, id, 'Client')) };
      if (method === 'PATCH') {
        const current = find(clients, id, 'Client');
        const { id: _ignored, ...patch } = body;
        const previous = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            (current as unknown as Record<string, unknown>)[key],
          ]),
        );
        const next = touch({ ...current, ...patch }) as Client;
        clients.set(id, next);
        return result(clientView(next), { action: 'clients.update', input: { id, ...previous } });
      }
      if (method === 'DELETE') {
        const item = clientView(find(clients, id, 'Client'));
        gone.add(id);
        return result(item, { action: 'clients.restore', input: { id } });
      }
    }

    // ---- projects ----
    if (method === 'GET' && path === '/projects') {
      return {
        items: live(projects)
          .filter((project) => query.status === undefined || project.status === query.status)
          .filter(
            (project) => query.clientId === undefined || project.client?.id === query.clientId,
          )
          .map(projectView),
      };
    }
    if (method === 'POST' && path === '/projects') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title === '') throw new ApiError(400, 'validation_error', 'Title is required');
      const { clientId, ...rest } = body;
      const client = typeof clientId === 'string' ? find(clients, clientId, 'Client') : null;
      const project = makeProject({
        ...(rest as Partial<Project>),
        title,
        client: client ? { id: client.id, name: client.name } : null,
      });
      projects.set(project.id, project);
      return result(projectView(project), { action: 'projects.delete', input: { id: project.id } });
    }

    const itemsRoute = /^\/projects\/([^/]+)\/items$/.exec(path);
    if (method === 'GET' && itemsRoute) {
      const id = itemsRoute[1] ?? '';
      find(projects, id, 'Project');
      return {
        item: {
          tasks: projectTasks(id).sort((a, b) => a.position - b.position),
          notes: projectNotes(id),
        },
      };
    }

    const milestonesRoute = /^\/projects\/([^/]+)\/milestones$/.exec(path);
    if (milestonesRoute) {
      const projectId = milestonesRoute[1] ?? '';
      find(projects, projectId, 'Project');
      if (method === 'GET') {
        return {
          items: live(milestones)
            .filter((milestone) => milestone.projectId === projectId)
            .sort((a, b) => a.position - b.position),
        };
      }
      if (method === 'POST') {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (title === '') throw new ApiError(400, 'validation_error', 'Title is required');
        const milestone = makeMilestone(projectId, {
          title,
          dueAt: typeof body.dueAt === 'string' ? body.dueAt : null,
        });
        milestones.set(milestone.id, milestone);
        return result(milestone, { action: 'milestones.delete', input: { id: milestone.id } });
      }
    }

    const statusRoute = /^\/projects\/([^/]+)\/status$/.exec(path);
    if (method === 'POST' && statusRoute) {
      const id = statusRoute[1] ?? '';
      const current = find(projects, id, 'Project');
      const next = touch({ ...current, status: body.status as ProjectStatus });
      projects.set(id, next);
      return result(projectView(next), {
        action: 'projects.update',
        input: { id, status: current.status },
      });
    }

    const oneProject = /^\/projects\/([^/]+)$/.exec(path);
    if (oneProject) {
      const id = oneProject[1] ?? '';
      if (method === 'GET') return { item: projectView(find(projects, id, 'Project')) };
      if (method === 'PATCH') {
        const current = find(projects, id, 'Project');
        const { id: _ignored, clientId, ...patch } = body;
        const previous = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            (current as unknown as Record<string, unknown>)[key],
          ]),
        );
        let client = current.client;
        if (clientId !== undefined) {
          const found = typeof clientId === 'string' ? find(clients, clientId, 'Client') : null;
          client = found ? { id: found.id, name: found.name } : null;
        }
        const next = touch({ ...current, ...patch, client }) as Project;
        projects.set(id, next);
        return result(projectView(next), {
          action: 'projects.update',
          input: { id, ...previous, ...(clientId !== undefined ? { client: current.client } : {}) },
        });
      }
      if (method === 'DELETE') {
        const item = projectView(find(projects, id, 'Project'));
        gone.add(id);
        return result(item, { action: 'projects.restore', input: { id } });
      }
    }

    // ---- a task or note and its project ----
    const taskRoute = /^\/tasks\/([^/]+)\/project$/.exec(path);
    if (taskRoute) {
      const taskId = taskRoute[1] ?? '';
      if (method === 'GET') {
        const projectId = taskProject.get(taskId);
        const project = projectId ? projects.get(projectId) : undefined;
        return {
          item: project && !gone.has(project.id) ? { id: project.id, title: project.title } : null,
        };
      }
      if (method === 'PUT') {
        const before = taskProject.get(taskId) ?? null;
        const projectId = body.projectId;
        if (typeof projectId === 'string') {
          const project = find(projects, projectId, 'Project');
          if (!taskCopies.has(taskId)) {
            // A task made through POST /tasks that this mock has not seen yet
            taskCopies.set(taskId, {
              id: taskId,
              title: lastCreatedTitle,
              description: null,
              status: 'todo',
              priority: 4,
              dueAt: null,
              dueAllDay: false,
              reminderAt: null,
              recurrenceRule: null,
              parentTaskId: null,
              position: counter,
              completedAt: null,
              archivedAt: null,
              createdAt: NOW,
              updatedAt: NOW,
              tags: [],
              subtaskCount: 0,
              subtasksDone: 0,
              blockedBy: [],
              goal: null,
            });
          }
          taskProject.set(taskId, project.id);
          return result(projectView(project), {
            action: 'projects.setTaskProject',
            input: { taskId, projectId: before },
          });
        }
        taskProject.delete(taskId);
        const old = before ? projects.get(before) : undefined;
        return result(old ? projectView(old) : null, {
          action: 'projects.setTaskProject',
          input: { taskId, projectId: before },
        });
      }
    }
    const noteRoute = /^\/notes\/([^/]+)\/project$/.exec(path);
    if (method === 'PUT' && noteRoute) {
      const noteId = noteRoute[1] ?? '';
      const before = noteProject.get(noteId) ?? null;
      const projectId = body.projectId;
      if (typeof projectId === 'string') {
        const project = find(projects, projectId, 'Project');
        if (!noteCopies.has(noteId)) {
          noteCopies.set(noteId, makeProjectNote({ id: noteId, title: 'Note' }));
        }
        noteProject.set(noteId, project.id);
        return result(projectView(project), {
          action: 'projects.setNoteProject',
          input: { noteId, projectId: before },
        });
      }
      noteProject.delete(noteId);
      const old = before ? projects.get(before) : undefined;
      return result(old ? projectView(old) : null, {
        action: 'projects.setNoteProject',
        input: { noteId, projectId: before },
      });
    }

    // ---- milestones ----
    const oneMilestone = /^\/milestones\/([^/]+)$/.exec(path);
    if (oneMilestone) {
      const id = oneMilestone[1] ?? '';
      if (method === 'PATCH') {
        const current = find(milestones, id, 'Milestone');
        const { id: _ignored, done, ...patch } = body;
        const next = touch({
          ...current,
          ...patch,
          ...(done === true ? { doneAt: new Date().toISOString() } : {}),
          ...(done === false ? { doneAt: null } : {}),
        }) as Milestone;
        milestones.set(id, next);
        return result(next, {
          action: 'milestones.update',
          input: { id, title: current.title, dueAt: current.dueAt, done: current.doneAt !== null },
        });
      }
      if (method === 'DELETE') {
        const item = find(milestones, id, 'Milestone');
        gone.add(id);
        return result(item, { action: 'milestones.restore', input: { id } });
      }
    }

    // ---- time ----
    if (method === 'GET' && path === '/time-entries/running') {
      const running = liveEntries().find((entry) => entry.endedAt === null);
      return { item: running ? entryView(running) : null };
    }
    if (method === 'GET' && path === '/time-entries/summary') return { item: summary(query) };
    if (method === 'GET' && path === '/time-entries') {
      const from = query.from ? Date.parse(String(query.from)) : null;
      const to = query.to ? Date.parse(String(query.to)) : null;
      const limit = query.limit === undefined ? 200 : Number(query.limit);
      return {
        items: liveEntries()
          .filter((entry) => query.projectId === undefined || entry.projectId === query.projectId)
          .filter((entry) => query.taskId === undefined || entry.taskId === query.taskId)
          .filter((entry) => from === null || Date.parse(entry.startedAt) >= from)
          .filter((entry) => to === null || Date.parse(entry.startedAt) < to)
          .slice(0, limit)
          .map(entryView),
      };
    }
    if (method === 'POST' && path === '/time-entries/start') {
      const project = find(projects, String(body.projectId), 'Project');
      stopRunning();
      const entry = makeTimeEntry(project.id, {
        projectTitle: project.title,
        taskId: typeof body.taskId === 'string' ? body.taskId : null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        seconds: 0,
        note: typeof body.note === 'string' ? body.note : null,
      });
      entries.set(entry.id, entry);
      return result(entryView(entry), { action: 'time.delete', input: { id: entry.id } });
    }
    if (method === 'POST' && path === '/time-entries/stop') {
      const running = liveEntries().find(
        (entry) => entry.endedAt === null && (body.id === undefined || entry.id === body.id),
      );
      if (!running) throw new ApiError(404, 'not_found', 'No timer is running');
      const stopped = stopRunning();
      return result(entryView(stopped ?? running), {
        action: 'time.delete',
        input: { id: running.id },
      });
    }
    if (method === 'POST' && path === '/time-entries') {
      const project = find(projects, String(body.projectId), 'Project');
      const startedAt = String(body.startedAt);
      const endedAt = String(body.endedAt);
      if (Date.parse(endedAt) <= Date.parse(startedAt)) {
        throw new ApiError(400, 'validation_error', 'The end must be after the start');
      }
      if (Date.parse(endedAt) - Date.parse(startedAt) > DAY_MS) {
        throw new ApiError(400, 'validation_error', 'An entry can be at most 24 hours');
      }
      const entry = makeTimeEntry(project.id, {
        projectTitle: project.title,
        taskId: typeof body.taskId === 'string' ? body.taskId : null,
        startedAt,
        endedAt,
        note: typeof body.note === 'string' ? body.note : null,
      });
      entries.set(entry.id, entry);
      return result(entryView(entry), { action: 'time.delete', input: { id: entry.id } });
    }
    const oneEntry = /^\/time-entries\/([^/]+)$/.exec(path);
    if (oneEntry) {
      const id = oneEntry[1] ?? '';
      if (method === 'PATCH') {
        const current = find(entries, id, 'Time entry');
        const { id: _ignored, ...patch } = body;
        const next = { ...current, ...patch } as TimeEntry;
        entries.set(id, next);
        return result(entryView(next), {
          action: 'time.update',
          input: {
            id,
            startedAt: current.startedAt,
            endedAt: current.endedAt,
            taskId: current.taskId,
            note: current.note,
          },
        });
      }
      if (method === 'DELETE') {
        const item = entryView(find(entries, id, 'Time entry'));
        gone.add(id);
        return result(item, { action: 'time.restore', input: { id } });
      }
    }

    return NOT_HANDLED;
  };

  const seed = (data: ProjectsSeed) => {
    for (const client of data.clients ?? []) clients.set(client.id, client);
    for (const project of data.projects ?? []) projects.set(project.id, project);
    for (const milestone of data.milestones ?? []) milestones.set(milestone.id, milestone);
    for (const entry of data.entries ?? []) entries.set(entry.id, entry);
    for (const { task, projectId } of data.tasks ?? []) {
      taskCopies.set(task.id, task);
      taskProject.set(task.id, projectId);
    }
    for (const { note, projectId } of data.notes ?? []) {
      noteCopies.set(note.id, note);
      noteProject.set(note.id, projectId);
    }
  };

  const fake: ProjectsFake = {
    handle,
    seed,
    clients: () => live(clients).map(clientView),
    projects: () => live(projects).map(projectView),
    milestones: () => live(milestones),
    entries: () => liveEntries().map(entryView),
    taskProjectOf: (taskId: string) => taskProject.get(taskId) ?? null,
    noteProjectOf: (noteId: string) => noteProject.get(noteId) ?? null,
  };
  latest = fake;
  return fake;
}

let latest: ProjectsFake | null = null;

/** The mock that the most recent createFakeApi() built (call it right after createFakeApi). */
export function currentProjectsFake(): ProjectsFake {
  if (!latest) throw new Error('No Projects mock yet: call createFakeApi() first');
  return latest;
}
