import { noteFolders, notes, type NoteFolderRow } from '@personal-os/db';
import {
  FOLDER_DEPTH_MAX,
  FOLDER_NAME_MAX,
  noteFolderActions,
  type NoteFolder,
} from '@personal-os/shared';
import { and, asc, eq } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * Note folders (docs/design/research/notes.md D3, D15). A tree of at most FOLDER_DEPTH_MAX levels.
 * A live folder name is unique inside its parent, ignoring case (409 folder_name_taken). Delete is
 * a soft delete and only works on a folder with no live notes and no live sub-folders (409
 * folder_not_empty); restore is its undo.
 */

const notFound = () => new HttpError(404, 'not_found', 'Folder not found');
const invalid = (message: string) => new HttpError(400, 'validation_error', message);
const nameTaken = () =>
  new HttpError(409, 'folder_name_taken', 'A folder with that name already exists here');

export function toNoteFolder(row: NoteFolderRow, noteCount: number): NoteFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    noteCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The user's live folders by id. */
async function liveFolders(scope: UserScope): Promise<Map<string, NoteFolderRow>> {
  const rows = await scope.select(noteFolders, {
    where: scope.isLive(noteFolders),
    orderBy: [asc(noteFolders.createdAt), asc(noteFolders.id)],
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/** How many live notes sit directly in a folder. */
async function noteCountOf(scope: UserScope, folderId: string): Promise<number> {
  const rows = await scope.selectFields(
    notes,
    { id: notes.id },
    { where: and(eq(notes.folderId, folderId), scope.isLive(notes)) },
  );
  return rows.length;
}

/** Levels from the top down to and including this folder (a top-level folder is 1). */
function depthOf(folders: Map<string, NoteFolderRow>, id: string | null): number {
  let depth = 0;
  let current = id === null ? undefined : folders.get(id);
  while (current && depth <= FOLDER_DEPTH_MAX + 1) {
    depth += 1;
    current = current.parentId === null ? undefined : folders.get(current.parentId);
  }
  return depth;
}

function childrenOf(folders: Map<string, NoteFolderRow>, id: string): NoteFolderRow[] {
  return [...folders.values()].filter((row) => row.parentId === id);
}

/** Levels in the subtree under (and including) a folder; a folder with no children is 1. */
function heightOf(folders: Map<string, NoteFolderRow>, id: string, guard = 0): number {
  if (guard > FOLDER_DEPTH_MAX + 1) return guard;
  const heights = childrenOf(folders, id).map((child) => heightOf(folders, child.id, guard + 1));
  return 1 + Math.max(0, ...heights);
}

function isSelfOrDescendant(
  folders: Map<string, NoteFolderRow>,
  folderId: string,
  candidateId: string,
): boolean {
  let current = folders.get(candidateId);
  for (let step = 0; current && step <= FOLDER_DEPTH_MAX + 1; step++) {
    if (current.id === folderId) return true;
    current = current.parentId === null ? undefined : folders.get(current.parentId);
  }
  return false;
}

const tooDeep = () =>
  new HttpError(
    400,
    'folder_too_deep',
    `Folders can be at most ${String(FOLDER_DEPTH_MAX)} levels deep`,
  );

/** A live parent of the user, or a 404 (a stranger's folder looks the same as a missing one). */
function requireParent(folders: Map<string, NoteFolderRow>, parentId: string): NoteFolderRow {
  const parent = folders.get(parentId);
  if (!parent) throw new HttpError(404, 'not_found', 'Parent folder not found');
  return parent;
}

function nameTakenIn(
  folders: Map<string, NoteFolderRow>,
  parentId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  return [...folders.values()].some(
    (row) => row.id !== exceptId && row.parentId === parentId && sameName(row.name, name),
  );
}

/** The unique index backs the checks above if two requests race. */
function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error ? error.cause : null;
  return code(error) === '23505' || code(cause) === '23505';
}

async function guardNameRace<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/** "Name (2)", "Name (3)", ... the first one not used in that parent. */
function freeName(folders: Map<string, NoteFolderRow>, parentId: string | null, name: string) {
  if (!nameTakenIn(folders, parentId, name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${String(n)})`;
    const candidate = `${name.slice(0, FOLDER_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!nameTakenIn(folders, parentId, candidate)) return candidate;
  }
}

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

export const noteFolderImplementations = [
  implement(noteFolderActions.list, async ({ scope }) => {
    const folders = await liveFolders(scope);
    const noteRows = await scope.selectFields(
      notes,
      { folderId: notes.folderId },
      { where: scope.isLive(notes) },
    );
    const counts = new Map<string, number>();
    for (const row of noteRows) {
      if (typeof row.folderId === 'string') {
        counts.set(row.folderId, (counts.get(row.folderId) ?? 0) + 1);
      }
    }
    return {
      data: [...folders.values()].map((row) => toNoteFolder(row, counts.get(row.id) ?? 0)),
    };
  }),

  implement(noteFolderActions.create, ({ scope }, { name, parentId }) =>
    guardNameRace(() =>
      scope.transaction(async (tx) => {
        const folders = await liveFolders(tx);
        const parent =
          parentId === null || parentId === undefined ? null : requireParent(folders, parentId);
        if (depthOf(folders, parent?.id ?? null) + 1 > FOLDER_DEPTH_MAX) throw tooDeep();
        if (nameTakenIn(folders, parent?.id ?? null, name)) throw nameTaken();
        const [created] = await tx.insert(noteFolders, { name, parentId: parent?.id ?? null });
        if (!created) throw new Error('Could not create the folder');
        return {
          data: toNoteFolder(created, 0),
          undo: { action: 'noteFolders.delete', input: { id: created.id } },
        };
      }),
    ),
  ),

  implement(noteFolderActions.update, ({ scope }, { id, name, parentId }) =>
    guardNameRace(() =>
      scope.transaction(async (tx) => {
        const folders = await liveFolders(tx);
        const current = folders.get(id);
        if (!current) throw notFound();
        const nextName = name ?? current.name;
        const nextParentId = parentId === undefined ? current.parentId : parentId;
        const moved = nextParentId !== current.parentId;
        if (nextName === current.name && !moved) {
          return { data: toNoteFolder(current, await noteCountOf(tx, id)), undo: null };
        }
        if (moved && nextParentId !== null) {
          requireParent(folders, nextParentId);
          if (isSelfOrDescendant(folders, id, nextParentId)) {
            throw invalid('A folder cannot be moved into itself or a folder inside it');
          }
          if (depthOf(folders, nextParentId) + heightOf(folders, id) > FOLDER_DEPTH_MAX) {
            throw tooDeep();
          }
        }
        if (nameTakenIn(folders, nextParentId, nextName, id)) throw nameTaken();
        const [updated] = await tx.update(
          noteFolders,
          { name: nextName, parentId: nextParentId, updatedAt: new Date() },
          and(eq(noteFolders.id, id), tx.isLive(noteFolders)) ?? eq(noteFolders.id, id),
        );
        if (!updated) throw notFound();
        return {
          data: toNoteFolder(updated, await noteCountOf(tx, id)),
          undo: {
            action: 'noteFolders.update',
            input: { id, name: current.name, parentId: current.parentId },
          },
        };
      }),
    ),
  ),

  implement(noteFolderActions.delete, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const folders = await liveFolders(tx);
      const current = folders.get(id);
      if (!current) throw notFound();
      const noteCount = await noteCountOf(tx, id);
      if (noteCount > 0) {
        throw new HttpError(
          409,
          'folder_not_empty',
          `Move or delete the ${plural(noteCount, 'note', 'notes')} in this folder first.`,
        );
      }
      const childCount = childrenOf(folders, id).length;
      if (childCount > 0) {
        throw new HttpError(
          409,
          'folder_not_empty',
          `Move or delete the ${plural(childCount, 'folder', 'folders')} in this folder first.`,
        );
      }
      const [deleted] = await tx.softDelete(
        noteFolders,
        and(eq(noteFolders.id, id), tx.isLive(noteFolders)) ?? eq(noteFolders.id, id),
      );
      if (!deleted) throw notFound();
      return {
        data: toNoteFolder(deleted, 0),
        undo: { action: 'noteFolders.restore', input: { id } },
      };
    }),
  ),

  implement(noteFolderActions.restore, ({ scope }, { id }) =>
    guardNameRace(() =>
      scope.transaction(async (tx) => {
        const [current] = await tx.select(noteFolders, { where: eq(noteFolders.id, id), limit: 1 });
        if (!current) throw notFound();
        if (current.deletedAt === null) {
          return { data: toNoteFolder(current, await noteCountOf(tx, id)), undo: null };
        }
        const folders = await liveFolders(tx);
        // Back to the top level when the parent is gone or would now make it too deep
        const parentId =
          current.parentId !== null &&
          folders.has(current.parentId) &&
          depthOf(folders, current.parentId) < FOLDER_DEPTH_MAX
            ? current.parentId
            : null;
        const [restored] = await tx.update(
          noteFolders,
          {
            name: freeName(folders, parentId, current.name),
            parentId,
            deletedAt: null,
            updatedAt: new Date(),
          },
          eq(noteFolders.id, id),
        );
        if (!restored) throw notFound();
        return {
          data: toNoteFolder(restored, await noteCountOf(tx, id)),
          undo: { action: 'noteFolders.delete', input: { id } },
        };
      }),
    ),
  ),
];
