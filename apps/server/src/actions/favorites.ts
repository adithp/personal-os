import { tags, taskFavorites, type TaskFavoriteRow } from '@personal-os/db';
import {
  favoriteActions,
  MAX_FAVORITES,
  nextTagColor,
  sameFavoriteView,
  type Favorite,
  type FavoriteIcon,
  type FavoriteView,
} from '@personal-os/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * Favorites of the Tasks module (docs/design/research/tasks-favorites.md, section 5): saved My
 * tasks views in the task_favorites table. At most 12 live favorites (409 favorites_limit); every
 * tag id in a view must be a live tag of the user (400); creating a favorite with the same view as
 * a live one returns that one (view lists compared as sets, see sameFavoriteView in shared); a new
 * one takes the next palette color and an icon from its view when none is given; the order is a
 * position between two neighbours like tasks.move. Delete is a soft delete with favorites.restore
 * as its undo.
 */

const POSITION_STEP = 1024;
/** Below this gap two positions are too close to put another one between them. */
const MIN_GAP = 1e-6;

const notFound = () => new HttpError(404, 'not_found', 'Favorite not found');
const invalid = (message: string) => new HttpError(400, 'validation_error', message);
const limitReached = () =>
  new HttpError(409, 'favorites_limit', `You can have at most ${String(MAX_FAVORITES)} favorites`);

export function toFavorite(row: TaskFavoriteRow): Favorite {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon as FavoriteIcon,
    view: row.view,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The user's live favorites in their order. */
function liveFavorites(scope: UserScope): Promise<TaskFavoriteRow[]> {
  return scope.select(taskFavorites, {
    where: scope.isLive(taskFavorites),
    orderBy: [asc(taskFavorites.position), asc(taskFavorites.createdAt), asc(taskFavorites.id)],
  });
}

async function findFavorite(
  scope: UserScope,
  id: string,
  live: boolean,
): Promise<TaskFavoriteRow | undefined> {
  const [row] = await scope.select(taskFavorites, {
    where: live
      ? and(eq(taskFavorites.id, id), scope.isLive(taskFavorites))
      : eq(taskFavorites.id, id),
    limit: 1,
  });
  return row;
}

/** The icon for a view with no icon given: tags only -> hash, else by the first filter set. */
function defaultIcon(view: FavoriteView): FavoriteIcon {
  if (view.tagIds && !view.status && !view.priority && !view.due && view.archived === undefined) {
    return 'hash';
  }
  if (view.priority) return 'flag';
  if (view.due) return 'calendar';
  if (view.status) return 'progress';
  if (view.archived !== undefined) return 'archive';
  return 'star';
}

/** Every tag in the view must be a live tag of this user (unknown and foreign look the same). */
async function checkTags(scope: UserScope, view: FavoriteView): Promise<void> {
  const ids = [...new Set(view.tagIds ?? [])];
  if (ids.length === 0) return;
  const found = await scope.select(tags, {
    where: and(scope.isLive(tags), inArray(tags.id, ids)),
  });
  if (found.length !== ids.length) throw invalid('Tag not found');
}

/** The favorite above and the one below a favorite, used to put it back. */
function neighboursOf(all: TaskFavoriteRow[], id: string): { afterId?: string; beforeId?: string } {
  const index = all.findIndex((row) => row.id === id);
  const above = all[index - 1];
  const below = all[index + 1];
  return {
    ...(above ? { afterId: above.id } : {}),
    ...(below ? { beforeId: below.id } : {}),
  };
}

/** The two positions the moved favorite goes between; null means open on that side. */
function bounds(
  siblings: TaskFavoriteRow[],
  afterId: string | undefined,
  beforeId: string | undefined,
): { lower: number | null; upper: number | null } {
  const position = (id: string) => siblings.find((row) => row.id === id)?.position;
  const after = afterId === undefined ? undefined : position(afterId);
  const before = beforeId === undefined ? undefined : position(beforeId);
  if (after !== undefined && before !== undefined) return { lower: after, upper: before };
  if (after !== undefined) {
    return { lower: after, upper: siblings.find((row) => row.position > after)?.position ?? null };
  }
  if (before !== undefined) {
    const lower = [...siblings].reverse().find((row) => row.position < before)?.position ?? null;
    return { lower, upper: before };
  }
  throw notFound();
}

export const favoriteImplementations = [
  implement(favoriteActions.list, async ({ scope }) => ({
    data: (await liveFavorites(scope)).map(toFavorite),
  })),

  implement(favoriteActions.create, ({ scope }, input) =>
    scope.transaction(async (tx) => {
      await checkTags(tx, input.view);
      const live = await liveFavorites(tx);
      const same = live.find((row) => sameFavoriteView(row.view, input.view));
      if (same) return { data: toFavorite(same), undo: null };
      if (live.length >= MAX_FAVORITES) throw limitReached();
      const last = live[live.length - 1];
      const [created] = await tx.insert(taskFavorites, {
        name: input.name,
        color: input.color ?? nextTagColor(live.length),
        icon: input.icon ?? defaultIcon(input.view),
        view: input.view,
        position: last ? last.position + POSITION_STEP : POSITION_STEP,
      });
      if (!created) throw new Error('Could not create the favorite');
      return {
        data: toFavorite(created),
        undo: { action: 'favorites.delete', input: { id: created.id } },
      };
    }),
  ),

  implement(favoriteActions.update, ({ scope }, { id, name, color, icon }) =>
    scope.transaction(async (tx) => {
      const current = await findFavorite(tx, id, true);
      if (!current) throw notFound();
      const values: Partial<Pick<TaskFavoriteRow, 'name' | 'color' | 'icon'>> = {};
      if (name !== undefined && name !== current.name) values.name = name;
      if (color !== undefined && color !== current.color) values.color = color;
      if (icon !== undefined && icon !== current.icon) values.icon = icon;
      if (Object.keys(values).length === 0) return { data: toFavorite(current), undo: null };
      const [updated] = await tx.update(
        taskFavorites,
        { ...values, updatedAt: new Date() },
        and(eq(taskFavorites.id, id), tx.isLive(taskFavorites)) ?? eq(taskFavorites.id, id),
      );
      if (!updated) throw notFound();
      return {
        data: toFavorite(updated),
        undo: {
          action: 'favorites.update',
          input: { id, name: current.name, color: current.color, icon: current.icon },
        },
      };
    }),
  ),

  implement(favoriteActions.move, ({ scope }, { id, afterId, beforeId }) =>
    scope.transaction(async (tx) => {
      const all = await liveFavorites(tx);
      const moved = all.find((row) => row.id === id);
      if (!moved) throw notFound();
      const old = neighboursOf(all, id);

      let siblings = all.filter((row) => row.id !== id);
      const neighbour = (neighbourId: string) => {
        if (neighbourId === id) throw invalid('A favorite cannot be placed next to itself');
        const row = siblings.find((entry) => entry.id === neighbourId);
        if (!row) throw notFound();
        return row;
      };
      const after = afterId === undefined ? undefined : neighbour(afterId);
      const before = beforeId === undefined ? undefined : neighbour(beforeId);
      if (after && before && after.position > before.position) {
        throw invalid('afterId must sit above beforeId');
      }

      let range = bounds(siblings, afterId, beforeId);
      if (range.lower !== null && range.upper !== null && range.upper - range.lower < MIN_GAP) {
        for (const [index, sibling] of siblings.entries()) {
          await tx.update(
            taskFavorites,
            { position: (index + 1) * POSITION_STEP },
            eq(taskFavorites.id, sibling.id),
          );
        }
        siblings = siblings.map((row, index) => ({
          ...row,
          position: (index + 1) * POSITION_STEP,
        }));
        range = bounds(siblings, afterId, beforeId);
      }
      const { lower, upper } = range;
      if (lower !== null && upper !== null && lower >= upper) {
        throw invalid('afterId must sit above beforeId');
      }
      let position = moved.position;
      if (lower !== null && upper !== null) position = (lower + upper) / 2;
      else if (lower !== null) position = lower + POSITION_STEP;
      else if (upper !== null) position = upper - POSITION_STEP;

      const [updated] = await tx.update(
        taskFavorites,
        { position, updatedAt: new Date() },
        and(eq(taskFavorites.id, id), tx.isLive(taskFavorites)) ?? eq(taskFavorites.id, id),
      );
      if (!updated) throw notFound();
      const hasOld = old.afterId !== undefined || old.beforeId !== undefined;
      return {
        data: toFavorite(updated),
        undo: hasOld ? { action: 'favorites.move', input: { id, ...old } } : null,
      };
    }),
  ),

  implement(favoriteActions.delete, async ({ scope }, { id }) => {
    const [deleted] = await scope.softDelete(
      taskFavorites,
      and(eq(taskFavorites.id, id), scope.isLive(taskFavorites)) ?? eq(taskFavorites.id, id),
    );
    if (!deleted) throw notFound();
    return { data: toFavorite(deleted), undo: { action: 'favorites.restore', input: { id } } };
  }),

  implement(favoriteActions.restore, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const current = await findFavorite(tx, id, false);
      if (!current) throw notFound();
      if (current.deletedAt === null) return { data: toFavorite(current), undo: null };
      if ((await liveFavorites(tx)).length >= MAX_FAVORITES) throw limitReached();
      const [restored] = await tx.update(
        taskFavorites,
        { deletedAt: null, updatedAt: new Date() },
        eq(taskFavorites.id, id),
      );
      if (!restored) throw notFound();
      return { data: toFavorite(restored), undo: { action: 'favorites.delete', input: { id } } };
    }),
  ),
];
