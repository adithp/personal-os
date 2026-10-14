import { entityTags, taskFavorites, tags, tasks, type TagRow } from '@personal-os/db';
import { nextTagColor, tagActions, type Tag } from '@personal-os/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { withUserLock } from '../lib/user-lock';
import { assertNoteSafeTagName, liveNoteCounts, rewriteNotesTag } from './note-tags';
import { implement } from './registry';

/**
 * Tag actions (docs/DATABASE.md): tags are a plain table (no entity row), unique per user ignoring
 * case among live tags.
 */

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * True for Postgres "unique violation" (23505), however the driver wraps the error. With
 * `constraint` only a violation of that index counts (the field is `constraint` in PGlite and
 * `constraint_name` in postgres-js).
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const fields = current as Error & {
      code?: string;
      constraint?: string;
      constraint_name?: string;
    };
    if (fields.code === '23505') {
      if (constraint === undefined) return true;
      if (fields.constraint === constraint || fields.constraint_name === constraint) return true;
    }
    current = current.cause;
  }
  return false;
}

/** The unique index on live tag names per user (see packages/db schema/tags.ts). */
export const TAG_NAME_INDEX = 'tags_user_name_idx';

/** The user's live tags, oldest first. */
function liveTags(scope: UserScope): Promise<TagRow[]> {
  return scope.select(tags, {
    where: scope.isLive(tags),
    orderBy: [asc(tags.createdAt), asc(tags.id)],
  });
}

/**
 * Finds the user's live tag with this name (ignoring capitals) or creates it, with the given color
 * or the next palette color. Runs in the caller's transaction.
 */
export async function findOrCreateTag(
  tx: UserScope,
  name: string,
  color?: string,
): Promise<{ tag: TagRow; created: boolean }> {
  // Compared in the database with lower(), like the unique index, so they cannot disagree
  const [existing] = await tx.select(tags, {
    where: and(tx.isLive(tags), sql`lower(${tags.name}) = lower(${name})`),
    limit: 1,
  });
  if (existing) return { tag: existing, created: false };
  const count = (await liveTags(tx)).length;
  const [created] = await tx.insert(tags, { name, color: color ?? nextTagColor(count) });
  if (!created) throw new Error('Could not create the tag');
  return { tag: created, created: true };
}

/**
 * The user's live tags with taskCount (live tasks and subtasks of any status, archived too) and
 * favoriteCount (live favorites whose view uses the tag) and noteCount (live notes with the tag in
 * their text). A few queries, however many tags.
 */
async function listWithCounts(scope: UserScope): Promise<Tag[]> {
  const rows = await liveTags(scope);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const links = await scope.select(entityTags, {
    where: and(
      inArray(entityTags.tagId, ids),
      sql`${entityTags.entityId} in (select ${tasks.id} from ${tasks} where ${tasks.userId} = ${scope.userId} and ${tasks.deletedAt} is null)`,
    ),
  });
  const favorites = await scope.select(taskFavorites, { where: scope.isLive(taskFavorites) });
  const noteCounts = await liveNoteCounts(scope, ids);
  const taskCounts = new Map<string, number>();
  for (const link of links) taskCounts.set(link.tagId, (taskCounts.get(link.tagId) ?? 0) + 1);
  const favoriteCounts = new Map<string, number>();
  for (const favorite of favorites) {
    for (const tagId of new Set(favorite.view.tagIds ?? [])) {
      favoriteCounts.set(tagId, (favoriteCounts.get(tagId) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({
    ...toTag(row),
    taskCount: taskCounts.get(row.id) ?? 0,
    favoriteCount: favoriteCounts.get(row.id) ?? 0,
    noteCount: noteCounts.get(row.id) ?? 0,
  }));
}

export const tagImplementations = [
  implement(tagActions.list, async ({ scope }) => ({ data: await listWithCounts(scope) })),

  implement(tagActions.create, async ({ scope }, input) => {
    const attempt = () => scope.transaction((tx) => findOrCreateTag(tx, input.name, input.color));
    let row: Awaited<ReturnType<typeof attempt>>;
    try {
      row = await attempt();
    } catch (error) {
      // Two creates of the same name at once: the second hits the unique index. Return the winner.
      if (!isUniqueViolation(error)) throw error;
      row = await attempt();
    }
    return { data: { ...toTag(row.tag), created: row.created }, undo: null };
  }),

  implement(tagActions.update, async ({ scope }, { id, name, color }) => {
    const run = () =>
      scope.transaction(async (tx) => {
        const all = await liveTags(tx);
        const current = all.find((tag) => tag.id === id);
        if (!current) throw new HttpError(404, 'not_found', 'Tag not found');
        if (name !== undefined && all.some((tag) => tag.id !== id && sameName(tag.name, name))) {
          throw new HttpError(409, 'conflict', 'A tag with this name already exists');
        }
        const values: Partial<Pick<TagRow, 'name' | 'color'>> = {};
        if (name !== undefined && name !== current.name) values.name = name;
        if (color !== undefined && color !== current.color) values.color = color;
        if (Object.keys(values).length === 0) return { data: toTag(current), undo: null };
        if (values.name !== undefined) await assertNoteSafeTagName(tx, id, values.name);
        const [updated] = await tx.update(
          tags,
          { ...values, updatedAt: new Date() },
          and(eq(tags.id, id), tx.isLive(tags)) ?? eq(tags.id, id),
        );
        if (!updated) throw new HttpError(404, 'not_found', 'Tag not found');
        // The tag lives in note text as #name, so a rename changes that text too (undo renames back)
        if (values.name !== undefined) await rewriteNotesTag(tx, id, current.name, values.name);
        return {
          data: toTag(updated),
          undo: {
            action: 'tags.update',
            input: { id, name: current.name, color: current.color },
          },
        };
      });
    // Same queue as note saves, so a save cannot slip a #old into a note while it is rewritten
    return withUserLock('notes', scope.userId, run).catch((error: unknown) => {
      // A rename that races another rename or create onto the same name
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'conflict', 'A tag with this name already exists');
      }
      throw error;
    });
  }),
];
