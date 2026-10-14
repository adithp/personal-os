import { z } from 'zod';
import { defineAction } from './actions';
import { favoriteViewSchema, uniqueItems } from './favorites';

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
export const MAX_UNDO_NOTES = 200;
export const MAX_UNDO_NOTE_SPOTS = 200;

/**
 * A note whose text a merge rewrote (`#source` to `#target`): the note revision right after the
 * rewrite and where each `#target` now stands, so unmerge can write `#source` back at those places.
 */
export const rewrittenNoteSchema = z.object({
  id,
  revision: z.number().int().min(1),
  spots: z.array(z.number().int().min(0)).max(MAX_UNDO_NOTE_SPOTS),
});
export type RewrittenNote = z.infer<typeof rewrittenNoteSchema>;

export const deleteTagInput = z.object({ id });
export const restoreTagInput = z.object({
  id,
  /** The tasks the tag was on. */
  taskIds: z.array(id).max(MAX_UNDO_TASK_IDS).transform(uniqueItems),
  favorites: z.array(touchedFavoriteSchema).max(12),
});
export const mergeTagInput = z
  .object({ sourceId: id, targetId: id })
  .refine((input) => input.sourceId !== input.targetId, { message: 'Pick two different tags' });
export const unmergeTagInput = z.object({
  sourceId: id,
  targetId: id,
  /** The tasks that had the source tag (those that also had the target keep the target tag). */
  taskIds: z.array(id).max(MAX_UNDO_TASK_IDS).transform(uniqueItems),
  /** The favorites the merge changed or removed, with their views before. */
  favorites: z.array(touchedFavoriteSchema).max(12),
  /**
   * The notes the merge rewrote. A note is only put back when it was not edited since (same
   * revision). Missing means the merge changed no notes.
   */
  notes: z.array(rewrittenNoteSchema).max(MAX_UNDO_NOTES).optional(),
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
    description: 'Undo a merge: bring the merged tag back, move its tasks back and write the tag name back into the notes the merge changed (if not edited since).',
    permission: 'write',
    input: unmergeTagInput,
  }),
} as const;
