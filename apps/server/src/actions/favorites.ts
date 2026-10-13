import { favoriteActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * Favorites of the Tasks module (docs/design/research/tasks-favorites.md, section 5): saved My
 * tasks views in the task_favorites table. At most 12 live favorites (409 favorites_limit); every
 * tag id in a view must be a live tag of the user (400); creating a favorite with the same view as
 * a live one returns that one (view lists compared as sets, see sameFavoriteView in shared); a new
 * one takes the next palette color and an icon from its view when none is given; the order is a
 * position between two neighbours like tasks.move. Delete is a soft delete with favorites.restore
 * as its undo.
 * CONTRACT STUBS: the Feature 5 server-dev agent implements them and owns this file.
 */
const notBuilt = () => {
  throw new HttpError(501, 'not_implemented', 'Favorites are not built yet');
};

export const favoriteImplementations = [
  implement(favoriteActions.list, notBuilt),
  implement(favoriteActions.create, notBuilt),
  implement(favoriteActions.update, notBuilt),
  implement(favoriteActions.move, notBuilt),
  implement(favoriteActions.delete, notBuilt),
  implement(favoriteActions.restore, notBuilt),
];
