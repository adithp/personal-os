import { tagManagementActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * Deleting and merging tags (docs/design/research/tasks-favorites.md decisions 16 to 18).
 * delete: soft-deletes the tag, removes it from every task (the tasks stay) and from favorites
 * (favorites.view loses the tag id; a favorite left with an empty view is soft-deleted), in one
 * transaction; the undo is tags.restore with the task ids and the touched favorites.
 * merge: moves every task link and favorite reference from the source tag to the target tag
 * (a task that has both keeps one link), then deletes the source; the undo is tags.unmerge.
 * restore and unmerge are the undo actions; they refuse with 409 when a live tag with the same
 * name exists again.
 * CONTRACT STUBS: the Feature 5 tags server-dev agent implements them and owns this file.
 */
const notBuilt = () => {
  throw new HttpError(501, 'not_implemented', 'Tag management is not built yet');
};

export const tagManagementImplementations = [
  implement(tagManagementActions.delete, notBuilt),
  implement(tagManagementActions.restore, notBuilt),
  implement(tagManagementActions.merge, notBuilt),
  implement(tagManagementActions.unmerge, notBuilt),
];
