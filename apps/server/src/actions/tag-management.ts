import { entityTags, taskFavorites, tags, tasks, type TagRow } from '@personal-os/db';
import {
  MAX_UNDO_TASK_IDS,
  removeTagFromView,
  replaceTagInView,
  tagManagementActions,
  type FavoriteView,
  type TouchedFavorite,
} from '@personal-os/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';
import { isUniqueViolation, toTag } from './tags';

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
 */

const notFound = () => new HttpError(404, 'not_found', 'Tag not found');

/** A live tag of the user, or 404. */
async function findLiveTag(tx: UserScope, id: string): Promise<TagRow> {
  const [row] = await tx.select(tags, { where: and(eq(tags.id, id), tx.isLive(tags)), limit: 1 });
  if (!row) throw notFound();
  return row;
}

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
 * Gives the tag to the listed tasks that do not have it yet. With liveOnly (undo) tasks deleted in
 * the meantime are skipped; a merge passes tasks that come from existing links.
 */
async function relinkTasks(
  tx: UserScope,
  tagId: string,
  taskIds: string[],
  liveOnly: boolean,
): Promise<void> {
  if (taskIds.length === 0) return;
  let ids = taskIds;
  if (liveOnly) {
    const live = await tx.select(tasks, {
      where: and(inArray(tasks.id, taskIds), tx.isLive(tasks)),
    });
    ids = live.map((task) => task.id);
  }
  const have = await tx.select(entityTags, {
    where: and(eq(entityTags.tagId, tagId), inArray(entityTags.entityId, taskIds)),
  });
  const linked = new Set(have.map((link) => link.entityId));
  await tx.insert(
    entityTags,
    ids.filter((entityId) => !linked.has(entityId)).map((entityId) => ({ entityId, tagId })),
  );
}

/** Puts favorite views back; un-deletes the ones that were removed. A missing favorite is skipped. */
async function restoreFavorites(tx: UserScope, touched: TouchedFavorite[]): Promise<void> {
  for (const { id, view, removed } of touched) {
    await tx.update(
      taskFavorites,
      { view, updatedAt: new Date(), ...(removed ? { deletedAt: null } : {}) },
      eq(taskFavorites.id, id),
    );
  }
}

/** A rename or create racing the restore hits the unique index: same answer as the check. */
async function asConflict<T>(scope: UserScope, tagId: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
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
    const { tag, taskIds, touched } = await scope.transaction(async (tx) => {
      const found = await findLiveTag(tx, id);
      const links = await tx.select(entityTags, { where: eq(entityTags.tagId, id) });
      await tx.delete(entityTags, eq(entityTags.tagId, id));
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
      return { tag: found, taskIds: links.map((link) => link.entityId), touched: touchedFavorites };
    });
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
      scope.transaction(async (tx) => {
        const revived = await reviveTag(tx, id);
        await relinkTasks(tx, id, taskIds, true);
        await restoreFavorites(tx, favorites);
        return revived;
      }),
    );
    return { data: toTag(tag), undo: { action: 'tags.delete', input: { id } } };
  }),

  implement(tagManagementActions.merge, async ({ scope }, { sourceId, targetId }) => {
    const { target, taskIds, touched } = await scope.transaction(async (tx) => {
      await findLiveTag(tx, sourceId);
      const targetTag = await findLiveTag(tx, targetId);
      const links = await tx.select(entityTags, { where: eq(entityTags.tagId, sourceId) });
      const ids = links.map((link) => link.entityId);
      // Tasks that already have the target keep their one link; the others get a new one
      await relinkTasks(tx, targetId, ids, false);
      await tx.delete(entityTags, eq(entityTags.tagId, sourceId));
      await tx.softDelete(tags, eq(tags.id, sourceId));
      const touchedFavorites: TouchedFavorite[] = [];
      for (const favorite of await favoritesUsing(tx, sourceId)) {
        const view: FavoriteView = replaceTagInView(favorite.view, sourceId, targetId);
        await tx.update(
          taskFavorites,
          { view, updatedAt: new Date() },
          eq(taskFavorites.id, favorite.id),
        );
        touchedFavorites.push({ id: favorite.id, view: favorite.view, removed: false });
      }
      return { target: targetTag, taskIds: ids, touched: touchedFavorites };
    });
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
      scope.transaction(async (tx) => {
        const revived = await reviveTag(tx, sourceId);
        await relinkTasks(tx, sourceId, taskIds, true);
        await restoreFavorites(tx, favorites);
        return revived;
      }),
    );
    return { data: toTag(tag), undo: null };
  }),
];
