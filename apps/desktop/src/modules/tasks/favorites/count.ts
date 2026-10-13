import type { Favorite, Task } from '@personal-os/shared';
import { applyFilters, filtersFromSearch } from '../filters';
import { sectionOf } from '../sections';
import { favoriteViewToSearch } from './view';

/** Open tasks of a saved view and how many of them are overdue. */
export function countFavorite(favorite: Favorite, openTasks: readonly Task[], now: Date) {
  const tasks = applyFilters(
    openTasks,
    filtersFromSearch(favoriteViewToSearch(favorite.view)),
    now,
  );
  return {
    open: tasks.length,
    overdue: tasks.filter((task) => sectionOf(task, now) === 'overdue').length,
  };
}
