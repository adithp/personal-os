import { z } from 'zod';
import { defineAction } from './actions';
import { favoriteViewSchema } from './favorites';

/**
 * Deleting and merging tags (Feature 5, docs/design/research/tasks-favorites.md decisions 16 to 18).
 * A tag's links to tasks are plain rows, so the undo carries what it needs to put them back.
 */
const id = z.uuid();

/** A favorite that a tag change touched: its view before the change and whether it was removed. */
export const touchedFavoriteSchema = z.object({
  id,
  view: favoriteViewSchema,
  removed: z.boolean(),
});
export type TouchedFavorite = z.infer<typeof touchedFavoriteSchema>;

export const MAX_UNDO_TASK_IDS = 5000;

export const deleteTagInput = z.object({ id });
export const restoreTagInput = z.object({
  id,
  /** The tasks the tag was on. */
  taskIds: z.array(id).max(MAX_UNDO_TASK_IDS),
  favorites: z.array(touchedFavoriteSchema).max(12),
});
export const mergeTagInput = z
  .object({ sourceId: id, targetId: id })
  .refine((input) => input.sourceId !== input.targetId, { message: 'Pick two different tags' });
export const unmergeTagInput = z.object({
  sourceId: id,
  targetId: id,
  /** The tasks that had the source tag (those that also had the target keep the target tag). */
  taskIds: z.array(id).max(MAX_UNDO_TASK_IDS),
  /** The favorites the merge changed or removed, with their views before. */
  favorites: z.array(touchedFavoriteSchema).max(12),
});

export const tagManagementActions = {
  delete: defineAction({
    name: 'tags.delete',
    description:
      'Delete a tag: it is removed from every task (the tasks stay) and from favorites. It can be restored.',
    permission: 'destructive',
    input: deleteTagInput,
  }),
  restore: defineAction({
    name: 'tags.restore',
    description: 'Bring back a deleted tag with its links to tasks and favorites.',
    permission: 'write',
    input: restoreTagInput,
  }),
  merge: defineAction({
    name: 'tags.merge',
    description:
      'Merge one tag into another: its tasks and favorites move to the other tag and the first tag is deleted.',
    permission: 'destructive',
    input: mergeTagInput,
  }),
  unmerge: defineAction({
    name: 'tags.unmerge',
    description: 'Undo a merge: bring the merged tag back and move its tasks back.',
    permission: 'write',
    input: unmergeTagInput,
  }),
} as const;
