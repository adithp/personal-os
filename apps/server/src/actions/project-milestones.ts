import { projectMilestones, type MilestoneRow } from '@personal-os/db';
import { milestoneActions, type Milestone, type UndoDescriptor } from '@personal-os/shared';
import { and, eq } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { findProject, iso, istDayStart } from './project-shared';
import { implement } from './registry';

/** Milestones of a project (docs/features/projects.md): a title, an optional due day, done or not. */

const POSITION_STEP = 1024;

const milestoneNotFound = () => new HttpError(404, 'not_found', 'Milestone not found');

function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    dueAt: iso(row.dueAt),
    doneAt: iso(row.doneAt),
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findMilestone(
  scope: UserScope,
  id: string,
  includeDeleted = false,
): Promise<MilestoneRow> {
  const [row] = await scope.select(projectMilestones, {
    where: includeDeleted
      ? eq(projectMilestones.id, id)
      : and(eq(projectMilestones.id, id), scope.isLive(projectMilestones)),
    limit: 1,
  });
  if (!row) throw milestoneNotFound();
  return row;
}

export const milestoneImplementations = [
  implement(milestoneActions.list, async ({ scope }, { projectId }) => {
    await findProject(scope, projectId);
    const rows = await scope.select(projectMilestones, {
      where: and(scope.isLive(projectMilestones), eq(projectMilestones.projectId, projectId)),
    });
    rows.sort(
      (a, b) =>
        a.position - b.position ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    return { data: rows.map(toMilestone) };
  }),

  implement(milestoneActions.create, async ({ scope }, input) =>
    scope.transaction(async (tx) => {
      await findProject(tx, input.projectId);
      const existing = await tx.select(projectMilestones, {
        where: and(
          tx.isLive(projectMilestones),
          eq(projectMilestones.projectId, input.projectId),
        ),
      });
      const position = existing.reduce((max, row) => Math.max(max, row.position), 0) + POSITION_STEP;
      const [created] = await tx.insert(projectMilestones, {
        projectId: input.projectId,
        title: input.title,
        dueAt: input.dueAt ? istDayStart(input.dueAt) : null,
        position,
      });
      if (!created) throw new Error('Could not create the milestone');
      return {
        data: toMilestone(created),
        undo: { action: 'milestones.delete', input: { id: created.id } },
      };
    }),
  ),

  implement(milestoneActions.update, async ({ scope }, { id, ...patch }) =>
    scope.transaction(async (tx) => {
      const current = await findMilestone(tx, id);
      const values: Partial<typeof projectMilestones.$inferInsert> = {};
      const previous: Record<string, unknown> = {};
      if (patch.title !== undefined && patch.title !== current.title) {
        values.title = patch.title;
        previous.title = current.title;
      }
      if (patch.dueAt !== undefined) {
        const next = patch.dueAt === null ? null : istDayStart(patch.dueAt);
        if (iso(next) !== iso(current.dueAt)) {
          values.dueAt = next;
          previous.dueAt = iso(current.dueAt);
        }
      }
      if (patch.done !== undefined && patch.done !== (current.doneAt !== null)) {
        values.doneAt = patch.done ? new Date() : null;
        previous.done = current.doneAt !== null;
      }
      if (Object.keys(values).length === 0) return { data: toMilestone(current), undo: null };
      const [updated] = await tx.update(projectMilestones, values, eq(projectMilestones.id, id));
      if (!updated) throw milestoneNotFound();
      return {
        data: toMilestone(updated),
        undo: { action: 'milestones.update', input: { id, ...previous } } satisfies UndoDescriptor,
      };
    }),
  ),

  implement(milestoneActions.delete, async ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      await findMilestone(tx, id);
      const [deleted] = await tx.softDelete(projectMilestones, eq(projectMilestones.id, id));
      if (!deleted) throw milestoneNotFound();
      return {
        data: toMilestone(deleted),
        undo: { action: 'milestones.restore', input: { id } },
      };
    }),
  ),

  implement(milestoneActions.restore, async ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const current = await findMilestone(tx, id, true);
      if (!current.deletedAt) return { data: toMilestone(current), undo: null };
      const [restored] = await tx.update(
        projectMilestones,
        { deletedAt: null },
        eq(projectMilestones.id, id),
      );
      if (!restored) throw milestoneNotFound();
      return {
        data: toMilestone(restored),
        undo: { action: 'milestones.delete', input: { id } },
      };
    }),
  ),
];
