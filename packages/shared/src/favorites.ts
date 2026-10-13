import { z } from 'zod';
import { defineAction } from './actions';
import { TAG_PALETTE } from './tags';
import { taskPrioritySchema, taskStatusSchema } from './tasks';

/**
 * Favorites of the Tasks module (docs/features/tasks-redesign.md, Feature 5; research memo
 * docs/design/research/tasks-favorites.md). A favorite is a saved My tasks view: the same values
 * the My tasks URL carries (status, priority, tags, due, archived, group, sort).
 */
export const DUE_FILTERS = ['any', 'overdue', 'today', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];
export const SORT_KEYS = ['manual', 'due', 'priority', 'created', 'title'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const GROUP_KEYS = ['due', 'none', 'tag', 'priority'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

/** Tabler icon names a favorite can use (the app maps them to icons). */
export const FAVORITE_ICONS = [
  'hash',
  'flag',
  'calendar',
  'progress',
  'archive',
  'star',
  'bolt',
  'briefcase',
  'home',
  'heart',
  'book',
  'target',
] as const;
export type FavoriteIcon = (typeof FAVORITE_ICONS)[number];

export const MAX_FAVORITES = 12;
export const FAVORITE_NAME_MAX = 40;

const favoriteName = z.string().trim().min(1, 'Name is required').max(FAVORITE_NAME_MAX);
const favoriteColor = z.string().refine((color) => TAG_PALETTE.some((entry) => entry === color), {
  message: 'Use a color from the palette',
});

/** The saved view. At least one key must be set. */
export const favoriteViewSchema = z
  .object({
    status: z.array(taskStatusSchema).min(1).max(3).optional(),
    priority: z.array(taskPrioritySchema).min(1).max(4).optional(),
    tagIds: z.array(z.uuid()).min(1).max(20).optional(),
    due: z.enum(DUE_FILTERS).optional(),
    archived: z.boolean().optional(),
    group: z.enum(GROUP_KEYS).optional(),
    sort: z.enum(SORT_KEYS).optional(),
  })
  .strict()
  .refine((view) => Object.keys(view).length > 0, {
    message: 'A favorite needs at least one filter, sort, or group',
  });
export type FavoriteView = z.infer<typeof favoriteViewSchema>;

/** A favorite as the API returns it. */
export const favoriteSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  icon: z.enum(FAVORITE_ICONS),
  view: favoriteViewSchema,
  position: z.number(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Favorite = z.infer<typeof favoriteSchema>;

const favoriteId = z.uuid();

export const createFavoriteInput = z.object({
  name: favoriteName,
  /** Default: the next palette color. */
  color: favoriteColor.optional(),
  /** Default: hash for a tag-only view, else by the first filter that is set. */
  icon: z.enum(FAVORITE_ICONS).optional(),
  view: favoriteViewSchema,
});
export type CreateFavoriteInput = z.infer<typeof createFavoriteInput>;

export const updateFavoriteInput = z
  .object({
    id: favoriteId,
    name: favoriteName.optional(),
    color: favoriteColor.optional(),
    icon: z.enum(FAVORITE_ICONS).optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.color !== undefined || input.icon !== undefined,
    {
      message: 'Nothing to change',
    },
  );
export type UpdateFavoriteInput = z.infer<typeof updateFavoriteInput>;

/** Put a favorite between two others (afterId above it, beforeId below it). Like tasks.move. */
export const moveFavoriteInput = z
  .object({ id: favoriteId, afterId: favoriteId.optional(), beforeId: favoriteId.optional() })
  .refine((input) => input.afterId !== undefined || input.beforeId !== undefined, {
    message: 'Nothing to move',
  });
export type MoveFavoriteInput = z.infer<typeof moveFavoriteInput>;

export const favoriteIdInput = z.object({ id: favoriteId });

export const favoriteActions = {
  list: defineAction({
    name: 'favorites.list',
    description: 'List the saved Tasks views (favorites) in their order.',
    permission: 'read',
    input: z.object({}),
  }),
  create: defineAction({
    name: 'favorites.create',
    description:
      'Save a My tasks view as a favorite (at most 12). The same view twice returns the existing one.',
    permission: 'write',
    input: createFavoriteInput,
  }),
  update: defineAction({
    name: 'favorites.update',
    description: 'Rename a favorite or change its color or icon.',
    permission: 'write',
    input: updateFavoriteInput,
  }),
  move: defineAction({
    name: 'favorites.move',
    description: 'Change the place of a favorite in the list.',
    permission: 'write',
    input: moveFavoriteInput,
  }),
  delete: defineAction({
    name: 'favorites.delete',
    description: 'Remove a favorite. It can be restored.',
    permission: 'write',
    input: favoriteIdInput,
  }),
  restore: defineAction({
    name: 'favorites.restore',
    description: 'Bring back a removed favorite.',
    permission: 'write',
    input: favoriteIdInput,
  }),
} as const;

/** What a write route for favorites returns. */
export interface FavoriteWriteResult {
  item: Favorite;
  undo: { action: string; input: Record<string, unknown> } | null;
}

const sameSet = <T>(a: readonly T[] | undefined, b: readonly T[] | undefined) => {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((value) => b.includes(value));
};

/** Two views are the same when they have the same keys and values (lists compared as sets). */
export function sameFavoriteView(a: FavoriteView, b: FavoriteView): boolean {
  return (
    sameSet(a.status, b.status) &&
    sameSet(a.priority, b.priority) &&
    sameSet(a.tagIds, b.tagIds) &&
    a.due === b.due &&
    a.archived === b.archived &&
    a.group === b.group &&
    a.sort === b.sort
  );
}

/**
 * The view without one tag (a deleted tag). Returns null when nothing is left: a favorite whose
 * only filter was that tag is removed.
 */
export function removeTagFromView(view: FavoriteView, tagId: string): FavoriteView | null {
  if (!view.tagIds?.includes(tagId)) return view;
  const { tagIds, ...rest } = view;
  const left = tagIds.filter((id) => id !== tagId);
  const next: FavoriteView = left.length > 0 ? { ...rest, tagIds: left } : rest;
  return Object.keys(next).length > 0 ? next : null;
}

/** The view with one tag replaced by another (a merged tag), without repeats. */
export function replaceTagInView(view: FavoriteView, fromId: string, toId: string): FavoriteView {
  if (!view.tagIds?.includes(fromId)) return view;
  return { ...view, tagIds: [...new Set(view.tagIds.map((id) => (id === fromId ? toId : id)))] };
}
