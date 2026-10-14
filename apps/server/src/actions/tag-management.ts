import { entityTags, taskFavorites, tags, tasks, type TagRow } from '@personal-os/db';
import {
  MAX_FAVORITES,
  MAX_UNDO_TASK_IDS,
  removeTagFromView,
  replaceTagInView,
  sameFavoriteView,
  tagManagementActions,
  type FavoriteView,
  type TouchedFavorite,
} from '@personal-os/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { liveTagIds, viewWithLiveTags, withFavoritesLock } from './favorites';
import { liveNoteCount, rewriteNotesTag } from './note-tags';
import { implement } from './registry';
import { TAG_NAME_INDEX, isUniqueViolation, toTag } from './tags';

/**
 * Deleting and merging tags (docs/design/research/tasks-favorites.md decisions 16 to 18).
 * delete: soft-deletes the tag, removes it from every task (the tasks stay) and from favorites
 * (favorites.view loses the tag id; a favorite left with an empty view is soft-deleted), in one
 * transaction; the undo is tags.restore with the task ids and the touched favorites.
 * merge: moves every task link and favorite reference from the source tag to the target tag
 * (a task that has both keeps one link), then deletes the source; the undo is tags.unmerge.
 * restore and unmerge are the undo actions; they refuse with 409 when a live tag with the same
 * name exists again.
 * An undo carries at most MAX_UNDO_TASK_IDS task ids. When more tasks were changed the action
 * still runs but returns no undo (null), so the app offers no Undo for such a huge change.
 * Known limits: unmerge does not take the target tag away from the tasks (from the input alone we
 * cannot know which of them had it before the merge); merge does not enforce the 20 tags per task
 * limit (a task keeps at most the tags it had, since its source link is replaced by the target).
 * Statements that list task ids work in batches of BATCH ids (Postgres allows 65,535 parameters
 * per statement). Only links of TASKS are moved or removed directly. Notes (N3): delete is refused
 * with 409 tag_in_notes while live notes contain the tag; merge rewrites `#source` to `#target` in
 * the note text (note-tags.ts), and unmerge does not undo that text change (it cannot know which
 * notes had the tag before).
 */

const BATCH = 1000;

/** Splits a list into pieces of at most `size` items. */
export function chunk<T>(items: T[], size = BATCH): T[][] {
  const pieces: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    pieces.push(items.slice(start, start + size));
  }
  return pieces;
}

/**
 * Delete and merge take the notes queue (the same one note saves use), then the favorites queue,
 * so a note save cannot add the tag back while it is being deleted or rewritten.
 */
const inNotesQueue = <T>(scope: UserScope, work: () => Promise<T>) =>
  withUserLock('notes', scope.userId, () => withFavoritesLock(scope.userId, work));

const notFound = () => new HttpError(404, 'not_found', 'Tag not found');

/** A live tag of the user, or 404. */
async function findLiveTag(tx: UserScope, id: string): Promise<TagRow> {
  const [row] = await tx.select(tags, { where: and(eq(tags.id, id), tx.isLive(tags)), limit: 1 });
  if (!row) throw notFound();
  return row;
}

/** The tag's links to tasks (live, archived or in the trash), never links of other entity types. */
const taskLinks = (tx: UserScope, tagId: string) =>
  and(
    eq(entityTags.tagId, tagId),
    sql`${entityTags.entityId} in (select ${tasks.id} from ${tasks} where ${tasks.userId} = ${tx.userId})`,
  ) ?? eq(entityTags.tagId, tagId);

/** The user's live favorites whose view uses this tag. */
async function favoritesUsing(tx: UserScope, tagId: string) {
  const live = await tx.select(taskFavorites, { where: tx.isLive(taskFavorites) });
  return live.filter((favorite) => favorite.view.tagIds?.includes(tagId));
}

/** The tag row (live or deleted) of the user, or 404; brings it back, 409 if its name is taken. */
async function reviveTag(tx: UserScope, id: string): Promise<TagRow> {
  const [row] = await tx.select(tags, { where: eq(tags.id, id), limit: 1 });
  if (!row) throw notFound();
  const [clash] = await tx.select(tags, {
    where: and(tx.isLive(tags), ne(tags.id, id), sql`lower(${tags.name}) = lower(${row.name})`),
    limit: 1,
  });
  if (clash) {
    throw new HttpError(
      409,
      'conflict',
      `A tag named '${row.name}' exists again. Rename it first.`,
    );
  }
  if (!row.deletedAt) return row;
  const [revived] = await tx.update(
    tags,
    { deletedAt: null, updatedAt: new Date() },
    eq(tags.id, id),
  );
  if (!revived) throw notFound();
  return revived;
}

/**
 * Gives the tag to the listed tasks that do not have it yet. Tasks that no longer exist are
 * skipped; a task in the trash gets the tag back too (it is still a task of the user).
 */
export async function relinkTasks(
  tx: UserScope,
  tagId: string,
  taskIds: string[],
  batch = BATCH,
): Promise<void> {
  for (const ids of chunk([...new Set(taskIds)], batch)) {
    const existing = await tx.select(tasks, { where: inArray(tasks.id, ids) });
    const existingIds = existing.map((task) => task.id);
    if (existingIds.length === 0) continue;
    const have = await tx.select(entityTags, {
      where: and(eq(entityTags.tagId, tagId), inArray(entityTags.entityId, existingIds)),
    });
    const linked = new Set(have.map((link) => link.entityId));
    await tx.insert(
      entityTags,
      existingIds
        .filter((entityId) => !linked.has(entityId))
        .map((entityId) => ({ entityId, tagId })),
    );
  }
}

/**
 * Puts favorite views back. Tag ids that are not live tags any more are dropped from the view (a
 * view with nothing left is skipped). A removed favorite is only un-deleted when there is room (12
 * live favorites) and no live favorite has the same view. A missing favorite is skipped.
 */
async function restoreFavorites(tx: UserScope, touched: TouchedFavorite[]): Promise<void> {
  if (touched.length === 0) return;
  const live = await tx.select(taskFavorites, { where: tx.isLive(taskFavorites) });
  const liveViews = new Map(live.map((row) => [row.id, row.view]));
  const rows = await tx.select(taskFavorites, {
    where: inArray(
      taskFavorites.id,
      touched.map((entry) => entry.id),
    ),
  });
  const liveTags = await liveTagIds(tx);
  for (const { id, view: before, removed } of touched) {
    const row = rows.find((entry) => entry.id === id);
    const view = viewWithLiveTags(before, liveTags);
    if (!row || !view) continue;
    const isDeleted = row.deletedAt !== null;
    if (removed && isDeleted) {
      if (liveViews.size >= MAX_FAVORITES) continue;
      if ([...liveViews.values()].some((other) => sameFavoriteView(other, view))) continue;
      liveViews.set(id, view);
      await tx.update(
        taskFavorites,
        { view, updatedAt: new Date(), deletedAt: null },
        eq(taskFavorites.id, id),
      );
    } else {
      if (!isDeleted) liveViews.set(id, view);
      await tx.update(taskFavorites, { view, updatedAt: new Date() }, eq(taskFavorites.id, id));
    }
  }
}

/** A rename or create racing the restore hits the tag name index: same answer as the check. */
async function asConflict<T>(scope: UserScope, tagId: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (!isUniqueViolation(error, TAG_NAME_INDEX)) throw error;
    const [row] = await scope.select(tags, { where: eq(tags.id, tagId), limit: 1 });
    throw new HttpError(
      409,
      'conflict',
      `A tag named '${row?.name ?? ''}' exists again. Rename it first.`,
    );
  }
}

export const tagManagementImplementations = [
  implement(tagManagementActions.delete, async ({ scope }, { id }) => {
    const { tag, taskIds, touched } = await inNotesQueue(scope, () =>
      scope.transaction(async (tx) => {
        const found = await findLiveTag(tx, id);
        // The #tag in the text would bring the tag back on the next save, so the notes go first
        const used = await liveNoteCount(tx, id);
        if (used > 0) {
          throw new HttpError(
            409,
            'tag_in_notes',
            `Remove #${found.name} from ${String(used)} ${used === 1 ? 'note' : 'notes'} first.`,
          );
        }
        const links = await tx.select(entityTags, { where: taskLinks(tx, id) });
        await tx.delete(entityTags, taskLinks(tx, id));
        await tx.softDelete(tags, eq(tags.id, id));
        const touchedFavorites: TouchedFavorite[] = [];
        for (const favorite of await favoritesUsing(tx, id)) {
          const next = removeTagFromView(favorite.view, id);
          if (next === null) {
            await tx.softDelete(taskFavorites, eq(taskFavorites.id, favorite.id));
          } else {
            await tx.update(
              taskFavorites,
              { view: next, updatedAt: new Date() },
              eq(taskFavorites.id, favorite.id),
            );
          }
          touchedFavorites.push({ id: favorite.id, view: favorite.view, removed: next === null });
        }
        return {
          tag: found,
          taskIds: links.map((link) => link.entityId),
          touched: touchedFavorites,
        };
      }),
    );
    return {
      data: toTag(tag),
      undo:
        taskIds.length > MAX_UNDO_TASK_IDS
          ? null
          : { action: 'tags.restore', input: { id, taskIds, favorites: touched } },
    };
  }),

  implement(tagManagementActions.restore, async ({ scope }, { id, taskIds, favorites }) => {
    const tag = await asConflict(
      scope,
      id,
      withFavoritesLock(scope.userId, () =>
        scope.transaction(async (tx) => {
          const revived = await reviveTag(tx, id);
          await relinkTasks(tx, id, taskIds);
          await restoreFavorites(tx, favorites);
          return revived;
        }),
      ),
    );
    return { data: toTag(tag), undo: { action: 'tags.delete', input: { id } } };
  }),

  implement(tagManagementActions.merge, async ({ scope }, { sourceId, targetId }) => {
    const { target, taskIds, touched } = await inNotesQueue(scope, () =>
      scope.transaction(async (tx) => {
        const sourceTag = await findLiveTag(tx, sourceId);
        const targetTag = await findLiveTag(tx, targetId);
        const links = await tx.select(entityTags, { where: taskLinks(tx, sourceId) });
        const ids = links.map((link) => link.entityId);
        // Tasks that already have the target keep their one link; the others get a new one
        await relinkTasks(tx, targetId, ids);
        await tx.delete(entityTags, taskLinks(tx, sourceId));
        await tx.softDelete(tags, eq(tags.id, sourceId));
        // Notes with #source now say #target (unmerge brings the tag back, not the old text)
        await rewriteNotesTag(tx, sourceId, sourceTag.name, targetTag.name);
        const touchedFavorites: TouchedFavorite[] = [];
        const live = await tx.select(taskFavorites, { where: tx.isLive(taskFavorites) });
        const liveViews = new Map(live.map((row) => [row.id, row.view]));
        for (const favorite of live.filter((row) => row.view.tagIds?.includes(sourceId))) {
          const view: FavoriteView = replaceTagInView(favorite.view, sourceId, targetId);
          const clash = [...liveViews].some(
            ([otherId, other]) => otherId !== favorite.id && sameFavoriteView(other, view),
          );
          if (clash) {
            // Two favorites would show the same view: the changed one goes (unmerge brings it back)
            await tx.softDelete(taskFavorites, eq(taskFavorites.id, favorite.id));
            liveViews.delete(favorite.id);
          } else {
            await tx.update(
              taskFavorites,
              { view, updatedAt: new Date() },
              eq(taskFavorites.id, favorite.id),
            );
            liveViews.set(favorite.id, view);
          }
          touchedFavorites.push({ id: favorite.id, view: favorite.view, removed: clash });
        }
        return { target: targetTag, taskIds: ids, touched: touchedFavorites };
      }),
    );
    return {
      data: toTag(target),
      undo:
        taskIds.length > MAX_UNDO_TASK_IDS
          ? null
          : { action: 'tags.unmerge', input: { sourceId, targetId, taskIds, favorites: touched } },
    };
  }),

  // The tasks keep the target tag: from the input alone we cannot know which of them had it before
  // the merge, so taking it away could remove a tag the user set on purpose.
  implement(tagManagementActions.unmerge, async ({ scope }, { sourceId, taskIds, favorites }) => {
    const tag = await asConflict(
      scope,
      sourceId,
      withFavoritesLock(scope.userId, () =>
        scope.transaction(async (tx) => {
          const revived = await reviveTag(tx, sourceId);
          await relinkTasks(tx, sourceId, taskIds);
          await restoreFavorites(tx, favorites);
          return revived;
        }),
      ),
    );
    return { data: toTag(tag), undo: null };
  }),
];
