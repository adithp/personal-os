import { clients, projects, timeEntries, type ClientRow, type ProjectRow } from '@personal-os/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';

/** Helpers shared by the Projects lane files (clients, projects, milestones, time). */

export const IST_MS = (5 * 60 + 30) * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** The start of the India calendar day that contains this time (a date is stored so). */
export const istDayStart = (isoTime: string) =>
  new Date(Math.floor((Date.parse(isoTime) + IST_MS) / DAY_MS) * DAY_MS - IST_MS);

export const iso = (date: Date | null) => (date ? date.toISOString() : null);

export const BATCH = 1000;
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    parts.push(items.slice(index, index + size));
  return parts;
}

export const projectNotFound = () => new HttpError(404, 'not_found', 'Project not found');
export const clientNotFound = () => new HttpError(404, 'not_found', 'Client not found');
export const taskNotFound = () => new HttpError(404, 'not_found', 'Task not found');

/** A project of this user that is live (or, with includeDeleted, deleted too). */
export async function findProject(
  scope: UserScope,
  id: string,
  includeDeleted = false,
): Promise<ProjectRow> {
  const [row] = await scope.select(projects, {
    where: includeDeleted ? eq(projects.id, id) : and(eq(projects.id, id), scope.isLive(projects)),
    limit: 1,
  });
  if (!row) throw projectNotFound();
  return row;
}

/** A client of this user that is live (or, with includeDeleted, deleted too). */
export async function findClient(
  scope: UserScope,
  id: string,
  includeDeleted = false,
): Promise<ClientRow> {
  const [row] = await scope.select(clients, {
    where: includeDeleted ? eq(clients.id, id) : and(eq(clients.id, id), scope.isLive(clients)),
    limit: 1,
  });
  if (!row) throw clientNotFound();
  return row;
}

/** Seconds of a time entry: finished = end - start, running = now - start. Never negative. */
export function entrySeconds(
  row: { startedAt: Date; endedAt: Date | null },
  now: Date = new Date(),
): number {
  const end = row.endedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - row.startedAt.getTime()) / 1000));
}

/** For each project id, the tracked seconds over its live time entries (the running one up to now). */
export async function loadTracked(
  scope: UserScope,
  projectIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const result = new Map<string, number>(projectIds.map((id) => [id, 0]));
  for (const batch of chunk(projectIds, BATCH)) {
    const rows = await scope.select(timeEntries, {
      where: and(scope.isLive(timeEntries), inArray(timeEntries.projectId, batch)),
    });
    for (const row of rows) {
      result.set(row.projectId, (result.get(row.projectId) ?? 0) + entrySeconds(row, now));
    }
  }
  return result;
}

/** The ids of the user's deleted projects (their time entries are hidden from lists and sums). */
export async function deletedProjectIds(scope: UserScope): Promise<string[]> {
  const rows = await scope.select(projects, { where: isNotNull(projects.deletedAt) });
  return rows.map((row) => row.id);
}
