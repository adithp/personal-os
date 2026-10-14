import {
  clients,
  entities,
  links,
  notes,
  projectMilestones,
  projects,
  tasks,
  type ClientRow,
  type ProjectRow,
  type TaskRow,
} from '@personal-os/db';
import {
  MAX_ITEMS_PER_PROJECT,
  clientActions,
  projectActions,
  type Client,
  type Project,
  type ProjectItems,
  type ProjectStatus,
  type TaskProject,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { loadGoalProgress } from './goals';
import { milestoneImplementations } from './project-milestones';
import {
  BATCH,
  chunk,
  clientNotFound,
  findClient,
  findProject,
  iso,
  istDayStart,
  loadTracked,
  projectNotFound,
  taskNotFound,
} from './project-shared';
import { timeImplementations } from './project-time';
import { implement } from './registry';
import { withDetails } from './tasks';

/**
 * Clients and projects of the Projects lane (docs/features/projects.md). A client is an entity of
 * type `client`, a project an entity of type `project`. A task or note joins a project through a live
 * `belongs_to` link (source = task or note, target = project), one project per item; links whose
 * target is a goal are never read as project links (and the other way round), so a task can be in
 * one goal and one project. Progress follows the goals rule (done over counted top-level tasks).
 * Deleting a client or project soft-deletes it and its entity row and keeps all links and rows, so
 * the undo brings everything back.
 */

// ----- Clients

async function presentClients(scope: UserScope, rows: ClientRow[]): Promise<Client[]> {
  const ids = rows.map((row) => row.id);
  const byClient = new Map<string, string[]>();
  for (const batch of chunk(ids, BATCH)) {
    const found = await scope.select(projects, {
      where: and(scope.isLive(projects), inArray(projects.clientId, batch)),
    });
    for (const project of found) {
      if (!project.clientId) continue;
      byClient.set(project.clientId, [...(byClient.get(project.clientId) ?? []), project.id]);
    }
  }
  const tracked = await loadTracked(scope, [...byClient.values()].flat());
  return rows.map((row) => {
    const projectIds = byClient.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      projectCount: projectIds.length,
      trackedSeconds: projectIds.reduce((sum, id) => sum + (tracked.get(id) ?? 0), 0),
    };
  });
}

const presentClient = async (scope: UserScope, row: ClientRow) =>
  (await presentClients(scope, [row]))[0] as Client;

const clientImplementations = [
  implement(clientActions.list, async ({ scope }) => {
    const rows = await scope.select(clients, { where: scope.isLive(clients) });
    const items = await presentClients(scope, rows);
    items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return { data: items };
  }),

  implement(clientActions.get, async ({ scope }, { id }) => ({
    data: await presentClient(scope, await findClient(scope, id)),
  })),

  implement(clientActions.create, async ({ scope }, input) => {
    const row = await scope.transaction(async (tx) => {
      const [entity] = await tx.insert(entities, { type: 'client', title: input.name });
      if (!entity) throw new Error('Could not create the client');
      const [created] = await tx.insert(clients, {
        id: entity.id,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        notes: input.notes ?? null,
      });
      if (!created) throw new Error('Could not create the client');
      return created;
    });
    return {
      data: await presentClient(scope, row),
      undo: { action: 'clients.delete', input: { id: row.id } },
    };
  }),

  implement(clientActions.update, async ({ scope }, { id, ...patch }) =>
    scope.transaction(async (tx) => {
      const current = await findClient(tx, id);
      const values: Partial<typeof clients.$inferInsert> = {};
      const previous: Record<string, unknown> = {};
      for (const key of ['name', 'email', 'phone', 'company', 'notes'] as const) {
        const next = patch[key];
        if (next !== undefined && next !== current[key]) {
          Object.assign(values, { [key]: next });
          previous[key] = current[key];
        }
      }
      if (Object.keys(values).length === 0) {
        return { data: await presentClient(tx, current), undo: null };
      }
      const [updated] = await tx.update(clients, values, eq(clients.id, id));
      if (!updated) throw clientNotFound();
      if (values.name !== undefined) {
        await tx.update(entities, { title: values.name }, eq(entities.id, id));
      }
      return {
        data: await presentClient(tx, updated),
        undo: { action: 'clients.update', input: { id, ...previous } } satisfies UndoDescriptor,
      };
    }),
  ),

  // Its projects keep pointing at it; a project shows a deleted client as no client
  implement(clientActions.delete, async ({ scope }, { id }) => {
    const row = await scope.transaction(async (tx) => {
      await findClient(tx, id);
      const [deleted] = await tx.softDelete(clients, eq(clients.id, id));
      await tx.softDelete(entities, eq(entities.id, id));
      if (!deleted) throw clientNotFound();
      return deleted;
    });
    return {
      data: await presentClient(scope, row),
      undo: { action: 'clients.restore', input: { id } },
    };
  }),

  implement(clientActions.restore, async ({ scope }, { id }) => {
    const { row, changed } = await scope.transaction(async (tx) => {
      const current = await findClient(tx, id, true);
      if (!current.deletedAt) return { row: current, changed: false };
      const [restored] = await tx.update(clients, { deletedAt: null }, eq(clients.id, id));
      await tx.update(entities, { deletedAt: null }, eq(entities.id, id));
      if (!restored) throw clientNotFound();
      return { row: restored, changed: true };
    });
    return {
      data: await presentClient(scope, row),
      undo: changed ? { action: 'clients.delete', input: { id } } : null,
    };
  }),
];

// ----- Projects

/** The live `belongs_to` links whose target is one of these projects. */
async function linksToProjects(scope: UserScope, projectIds: readonly string[]) {
  const rows: (typeof links.$inferSelect)[] = [];
  for (const batch of chunk(projectIds, BATCH)) {
    rows.push(
      ...(await scope.select(links, {
        where: and(
          scope.isLive(links),
          eq(links.relation, 'belongs_to'),
          inArray(links.targetId, batch),
        ),
      })),
    );
  }
  return rows;
}

async function presentProjects(scope: UserScope, rows: ProjectRow[]): Promise<Project[]> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  const clientIds = [
    ...new Set(rows.flatMap((row) => (row.clientId ? [row.clientId] : []))),
  ];
  const [progress, tracked, clientRows, linkRows] = await Promise.all([
    loadGoalProgress(scope, ids),
    loadTracked(scope, ids),
    clientIds.length === 0
      ? Promise.resolve([] as ClientRow[])
      : scope.select(clients, {
          where: and(scope.isLive(clients), inArray(clients.id, clientIds)),
        }),
    linksToProjects(scope, ids),
  ]);
  const clientById = new Map(clientRows.map((client) => [client.id, client]));

  // Notes: links whose source is a live note
  const noteIds = new Set<string>();
  for (const batch of chunk([...new Set(linkRows.map((link) => link.sourceId))], BATCH)) {
    const found = await scope.select(notes, {
      where: and(scope.isLive(notes), inArray(notes.id, batch)),
    });
    for (const note of found) noteIds.add(note.id);
  }
  const noteCounts = new Map<string, number>();
  for (const link of linkRows) {
    if (noteIds.has(link.sourceId)) {
      noteCounts.set(link.targetId, (noteCounts.get(link.targetId) ?? 0) + 1);
    }
  }

  const milestoneCounts = new Map<string, { done: number; total: number }>();
  for (const batch of chunk(ids, BATCH)) {
    const found = await scope.select(projectMilestones, {
      where: and(scope.isLive(projectMilestones), inArray(projectMilestones.projectId, batch)),
    });
    for (const milestone of found) {
      const count = milestoneCounts.get(milestone.projectId) ?? { done: 0, total: 0 };
      count.total += 1;
      if (milestone.doneAt) count.done += 1;
      milestoneCounts.set(milestone.projectId, count);
    }
  }

  return rows.map((row) => {
    const client = row.clientId ? clientById.get(row.clientId) : undefined;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      color: row.color,
      startAt: iso(row.startAt),
      dueAt: iso(row.dueAt),
      client: client ? { id: client.id, name: client.name } : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      progress: progress.get(row.id) ?? { done: 0, total: 0 },
      milestones: milestoneCounts.get(row.id) ?? { done: 0, total: 0 },
      noteCount: noteCounts.get(row.id) ?? 0,
      trackedSeconds: tracked.get(row.id) ?? 0,
    };
  });
}

const presentProject = async (scope: UserScope, row: ProjectRow) =>
  (await presentProjects(scope, [row]))[0] as Project;

const STATUS_ORDER: Record<ProjectStatus, number> = { active: 0, on_hold: 1, done: 2, archived: 3 };

/** By status, then the soonest due date (none last), then newest first. */
function compareProjects(a: Project, b: Project): number {
  if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  }
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

/** Live top-level tasks and live notes linked to a live project. */
async function linkedItems(
  scope: UserScope,
  projectId: string,
): Promise<{ taskRows: TaskRow[]; noteRows: (typeof notes.$inferSelect)[] }> {
  const linkRows = await linksToProjects(scope, [projectId]);
  const sourceIds = [...new Set(linkRows.map((link) => link.sourceId))];
  const taskRows: TaskRow[] = [];
  const noteRows: (typeof notes.$inferSelect)[] = [];
  for (const batch of chunk(sourceIds, BATCH)) {
    taskRows.push(
      ...(await scope.select(tasks, {
        where: and(scope.isLive(tasks), isNull(tasks.parentTaskId), inArray(tasks.id, batch)),
      })),
    );
    noteRows.push(
      ...(await scope.select(notes, {
        where: and(scope.isLive(notes), inArray(notes.id, batch)),
      })),
    );
  }
  return { taskRows, noteRows };
}

/** A client the project may point at: it must be a live client of this user. */
async function assertClient(scope: UserScope, clientId: string | null | undefined) {
  if (clientId) await findClient(scope, clientId);
}

/** The projects (live or deleted) an item (task or note) has a live `belongs_to` link to. */
async function loadItemProjects(
  scope: UserScope,
  sourceId: string,
): Promise<{ link: typeof links.$inferSelect; project: ProjectRow }[]> {
  const linkRows = await scope.select(links, {
    where: and(scope.isLive(links), eq(links.relation, 'belongs_to'), eq(links.sourceId, sourceId)),
  });
  if (linkRows.length === 0) return [];
  const projectRows = await scope.select(projects, {
    where: inArray(projects.id, [...new Set(linkRows.map((link) => link.targetId))]),
  });
  const byId = new Map(projectRows.map((project) => [project.id, project]));
  return linkRows.flatMap((link) => {
    const project = byId.get(link.targetId);
    return project ? [{ link, project }] : [];
  });
}

type ItemKind = 'task' | 'note';

/** The task or note must exist and be live; a task must be top-level. */
async function assertItem(scope: UserScope, kind: ItemKind, itemId: string) {
  if (kind === 'task') {
    const [task] = await scope.select(tasks, {
      where: and(eq(tasks.id, itemId), scope.isLive(tasks)),
      limit: 1,
    });
    if (!task) throw taskNotFound();
    if (task.parentTaskId) {
      throw new HttpError(400, 'validation_error', 'Link the parent task instead.');
    }
    return;
  }
  const [note] = await scope.select(notes, {
    where: and(eq(notes.id, itemId), scope.isLive(notes)),
    limit: 1,
  });
  if (!note) throw new HttpError(404, 'not_found', 'Note not found');
}

/**
 * Puts a task or note in a project inside the caller's transaction. Returns whether anything
 * changed and the live project the item was in before. Checks everything before changing anything.
 */
async function putItemInProject(
  scope: UserScope,
  kind: ItemKind,
  itemId: string,
  projectId: string,
): Promise<{ changed: boolean; previousProjectId: string | null }> {
  const [entity] = await scope.select(entities, {
    where: and(eq(entities.id, projectId), eq(entities.type, 'project'), scope.isLive(entities)),
    limit: 1,
  });
  if (!entity) throw projectNotFound();
  await findProject(scope, projectId);
  await assertItem(scope, kind, itemId);

  const existing = await loadItemProjects(scope, itemId);
  if (existing.some(({ project }) => project.id === projectId)) {
    return { changed: false, previousProjectId: projectId };
  }

  const { taskRows, noteRows } = await linkedItems(scope, projectId);
  if (taskRows.length + noteRows.length >= MAX_ITEMS_PER_PROJECT) {
    throw new HttpError(
      409,
      'project_full',
      `A project can have at most ${String(MAX_ITEMS_PER_PROJECT)} tasks and notes.`,
    );
  }

  // Move: leave the other live projects. Links to DELETED projects stay, so restoring such a
  // project (or the undo of this move) can bring the item back there
  const liveLinks = existing.filter(({ project }) => project.deletedAt === null);
  if (liveLinks.length > 0) {
    await scope.softDelete(
      links,
      inArray(
        links.id,
        liveLinks.map(({ link }) => link.id),
      ),
    );
  }
  await scope.insert(links, { sourceId: itemId, targetId: projectId, relation: 'belongs_to' });
  return { changed: true, previousProjectId: liveLinks[0]?.project.id ?? null };
}

function setItemProject(kind: ItemKind) {
  const action = kind === 'task' ? 'projects.setTaskProject' : 'projects.setNoteProject';
  const undoInput = (itemId: string, projectId: string | null) =>
    kind === 'task' ? { taskId: itemId, projectId } : { noteId: itemId, projectId };
  return ({ scope }: { scope: UserScope }, itemId: string, projectId: string | null) =>
    withUserLock('projects', scope.userId, () =>
      scope.transaction(async (tx) => {
        if (projectId !== null) {
          const { changed, previousProjectId } = await putItemInProject(
            tx,
            kind,
            itemId,
            projectId,
          );
          return {
            data: await presentProject(tx, await findProject(tx, projectId)),
            undo: changed
              ? ({ action, input: undoInput(itemId, previousProjectId) } satisfies UndoDescriptor)
              : null,
          };
        }
        // Take the item out of the project it is in (its link is soft-deleted)
        await assertItem(tx, kind, itemId);
        const current = (await loadItemProjects(tx, itemId)).find(
          ({ project }) => project.deletedAt === null,
        );
        if (!current) throw new HttpError(404, 'not_found', `The ${kind} is not in a project`);
        await tx.softDelete(links, eq(links.id, current.link.id));
        return {
          data: await presentProject(tx, current.project),
          undo: { action, input: undoInput(itemId, current.project.id) } satisfies UndoDescriptor,
        };
      }),
    );
}

const setTaskProject = setItemProject('task');
const setNoteProject = setItemProject('note');

const baseProjectImplementations = [
  implement(projectActions.list, async ({ scope }, input) => {
    const rows = await scope.select(projects, {
      where: and(
        scope.isLive(projects),
        input.status ? eq(projects.status, input.status) : undefined,
        input.clientId ? eq(projects.clientId, input.clientId) : undefined,
      ),
    });
    return { data: (await presentProjects(scope, rows)).sort(compareProjects) };
  }),

  implement(projectActions.get, async ({ scope }, { id }) => ({
    data: await presentProject(scope, await findProject(scope, id)),
  })),

  implement(projectActions.items, async ({ scope }, { id }) => {
    await findProject(scope, id);
    const { taskRows, noteRows } = await linkedItems(scope, id);
    const detailed = await withDetails(scope, taskRows);
    detailed.sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    const data: ProjectItems = {
      tasks: detailed,
      notes: noteRows
        .map((note) => ({
          id: note.id,
          title: note.title,
          updatedAt: note.updatedAt.toISOString(),
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
    };
    return { data };
  }),

  implement(projectActions.taskProject, async ({ scope }, { taskId }) => {
    const [task] = await scope.select(tasks, {
      where: and(eq(tasks.id, taskId), scope.isLive(tasks)),
      limit: 1,
    });
    if (!task) throw taskNotFound();
    const current = (await loadItemProjects(scope, taskId)).find(
      ({ project }) => project.deletedAt === null,
    );
    const data: TaskProject | null = current
      ? { id: current.project.id, title: current.project.title }
      : null;
    return { data };
  }),

  implement(projectActions.create, async ({ scope }, input) => {
    await assertClient(scope, input.clientId);
    const row = await scope.transaction(async (tx) => {
      const [entity] = await tx.insert(entities, { type: 'project', title: input.title });
      if (!entity) throw new Error('Could not create the project');
      const [created] = await tx.insert(projects, {
        id: entity.id,
        title: input.title,
        description: input.description ?? null,
        clientId: input.clientId ?? null,
        startAt: input.startAt ? istDayStart(input.startAt) : null,
        dueAt: input.dueAt ? istDayStart(input.dueAt) : null,
        color: input.color ?? null,
      });
      if (!created) throw new Error('Could not create the project');
      return created;
    });
    return {
      data: await presentProject(scope, row),
      undo: { action: 'projects.delete', input: { id: row.id } },
    };
  }),

  implement(projectActions.update, async ({ scope }, { id, ...patch }) =>
    scope.transaction(async (tx) => {
      const current = await findProject(tx, id);
      const values: Partial<typeof projects.$inferInsert> = {};
      const previous: Record<string, unknown> = {};
      if (patch.title !== undefined && patch.title !== current.title) {
        values.title = patch.title;
        previous.title = current.title;
      }
      if (patch.description !== undefined && patch.description !== current.description) {
        values.description = patch.description;
        previous.description = current.description;
      }
      if (patch.color !== undefined && patch.color !== current.color) {
        values.color = patch.color;
        previous.color = current.color;
      }
      if (patch.clientId !== undefined && patch.clientId !== current.clientId) {
        await assertClient(tx, patch.clientId);
        values.clientId = patch.clientId;
        previous.clientId = current.clientId;
      }
      for (const key of ['startAt', 'dueAt'] as const) {
        const given = patch[key];
        if (given === undefined) continue;
        const next = given === null ? null : istDayStart(given);
        if (iso(next) !== iso(current[key])) {
          values[key] = next;
          previous[key] = iso(current[key]);
        }
      }
      if (Object.keys(values).length === 0) {
        return { data: await presentProject(tx, current), undo: null };
      }
      const startAfter = 'startAt' in values ? values.startAt : current.startAt;
      const dueAfter = 'dueAt' in values ? values.dueAt : current.dueAt;
      if (startAfter && dueAfter && dueAfter.getTime() < startAfter.getTime()) {
        throw new HttpError(400, 'validation_error', 'The due date cannot be before the start date');
      }
      const [updated] = await tx.update(projects, values, eq(projects.id, id));
      if (!updated) throw projectNotFound();
      if (values.title !== undefined) {
        await tx.update(entities, { title: values.title }, eq(entities.id, id));
      }
      return {
        data: await presentProject(tx, updated),
        undo: { action: 'projects.update', input: { id, ...previous } } satisfies UndoDescriptor,
      };
    }),
  ),

  implement(projectActions.setStatus, async ({ scope }, { id, status }) =>
    scope.transaction(async (tx) => {
      const current = await findProject(tx, id);
      if (current.status === status) return { data: await presentProject(tx, current), undo: null };
      const [updated] = await tx.update(projects, { status }, eq(projects.id, id));
      if (!updated) throw projectNotFound();
      return {
        data: await presentProject(tx, updated),
        undo: {
          action: 'projects.setStatus',
          input: { id, status: current.status },
        } satisfies UndoDescriptor,
      };
    }),
  ),

  // Links, milestones, and time entries stay, so the undo brings the project back whole
  implement(projectActions.delete, async ({ scope }, { id }) => {
    const row = await scope.transaction(async (tx) => {
      await findProject(tx, id);
      const [deleted] = await tx.softDelete(projects, eq(projects.id, id));
      await tx.softDelete(entities, eq(entities.id, id));
      if (!deleted) throw projectNotFound();
      return deleted;
    });
    return {
      data: await presentProject(scope, row),
      undo: { action: 'projects.restore', input: { id } },
    };
  }),

  implement(projectActions.restore, async ({ scope }, { id }) => {
    const { row, changed } = await withUserLock('projects', scope.userId, () =>
      scope.transaction(async (tx) => {
      const current = await findProject(tx, id, true);
      if (!current.deletedAt) return { row: current, changed: false };
      const [restored] = await tx.update(projects, { deletedAt: null }, eq(projects.id, id));
      await tx.update(entities, { deletedAt: null }, eq(entities.id, id));
      if (!restored) throw projectNotFound();
      // An item that moved to another live project while this one was deleted stays there: its
      // old link to this project is dropped, so an item is never in two projects
      const own = await linksToProjects(tx, [id]);
      if (own.length > 0) {
        const others = await tx.select(links, {
          where: and(
            scope.isLive(links),
            eq(links.relation, 'belongs_to'),
            ne(links.targetId, id),
            inArray(links.sourceId, [...new Set(own.map((link) => link.sourceId))]),
          ),
        });
        const targetIds = [...new Set(others.map((link) => link.targetId))];
        const liveOther =
          targetIds.length === 0
            ? []
            : await tx.select(projects, {
                where: and(scope.isLive(projects), inArray(projects.id, targetIds)),
              });
        const liveIds = new Set(liveOther.map((project) => project.id));
        const moved = new Set(
          others.filter((link) => liveIds.has(link.targetId)).map((link) => link.sourceId),
        );
        const stale = own.filter((link) => moved.has(link.sourceId)).map((link) => link.id);
        if (stale.length > 0) await tx.softDelete(links, inArray(links.id, stale));
      }
      return { row: restored, changed: true };
      }),
    );
    return {
      data: await presentProject(scope, row),
      undo: changed ? { action: 'projects.delete', input: { id } } : null,
    };
  }),

  implement(projectActions.setTaskProject, (ctx, { taskId, projectId }) =>
    setTaskProject(ctx, taskId, projectId),
  ),

  implement(projectActions.setNoteProject, (ctx, { noteId, projectId }) =>
    setNoteProject(ctx, noteId, projectId),
  ),
];

export const projectImplementations = [
  ...clientImplementations,
  ...baseProjectImplementations,
  ...milestoneImplementations,
  ...timeImplementations,
];
