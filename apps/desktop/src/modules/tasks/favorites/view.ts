import {
  FAVORITE_NAME_MAX,
  TASK_PRIORITY_LABELS,
  type FavoriteIcon,
  type FavoriteView,
  type GroupKey,
  type SortKey,
} from '@personal-os/shared';
import { DEFAULT_GROUP, DEFAULT_SORT, type TaskSearch } from '../filters';

/**
 * Favorites are saved My tasks views (docs/design/research/tasks-favorites.md decisions 1 to 4).
 * These pure helpers turn a view into URL search params and back, and suggest a name and an icon.
 */

/** The My tasks URL search params that open this view. */
export function favoriteViewToSearch(view: FavoriteView): TaskSearch {
  const search: TaskSearch = {};
  if (view.status?.length) search.status = view.status;
  if (view.priority?.length) search.priority = view.priority;
  if (view.tagIds?.length) search.tag = view.tagIds;
  if (view.due && view.due !== 'any') search.due = view.due;
  if (view.archived) search.archived = true;
  // A favorite without sort or group opens with the My tasks defaults, not the last ones used
  search.group = view.group ?? DEFAULT_GROUP;
  search.sort = view.sort ?? DEFAULT_SORT;
  return search;
}

/**
 * The view the page shows now: the filters from the URL plus the sort and group (which may be the
 * defaults). Defaults are left out. Null when nothing differs from the defaults (nothing to save).
 */
export function currentFavoriteView(
  search: TaskSearch,
  sort: SortKey,
  group: GroupKey,
): FavoriteView | null {
  const view: FavoriteView = {};
  if (search.status?.length) view.status = search.status;
  if (search.priority?.length) view.priority = search.priority;
  if (search.tag?.length) view.tagIds = search.tag;
  if (search.due && search.due !== 'any') view.due = search.due;
  if (search.archived) view.archived = true;
  if (sort !== DEFAULT_SORT) view.sort = sort;
  if (group !== DEFAULT_GROUP) view.group = group;
  return Object.keys(view).length > 0 ? view : null;
}

const STATUS_NAMES = { todo: 'To do', doing: 'In progress', done: 'Done' } as const;
const DUE_NAMES = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'This week',
  none: 'No date',
} as const;

/**
 * A name from the filters in plain words, joined with " · ": a view with one tag is named after
 * the tag; others read like "Urgent priority · This week". At most 40 characters.
 */
export function suggestFavoriteName(
  view: FavoriteView,
  tagNames: ReadonlyMap<string, string>,
): string {
  const onlyTag = view.tagIds?.length === 1 && Object.keys(view).length === 1;
  const tagName = view.tagIds?.[0] ? tagNames.get(view.tagIds[0]) : undefined;
  if (onlyTag && tagName) return tagName.slice(0, FAVORITE_NAME_MAX);

  const parts: string[] = [];
  if (view.priority?.length) {
    parts.push(
      `${view.priority.map((priority) => TASK_PRIORITY_LABELS[priority]).join(', ')} priority`,
    );
  }
  if (view.status?.length) parts.push(view.status.map((status) => STATUS_NAMES[status]).join(', '));
  if (view.due && view.due !== 'any') parts.push(DUE_NAMES[view.due]);
  if (view.tagIds?.length) {
    const names = view.tagIds.flatMap((id) => tagNames.get(id) ?? []);
    if (names.length > 0) parts.push(names.join(', '));
  }
  if (view.archived) parts.push('Archived');
  if (parts.length === 0) {
    if (view.group && view.group !== 'none') parts.push(`By ${view.group}`);
    else if (view.sort) parts.push('Sorted');
    else parts.push('My view');
  }
  const name = parts.join(' · ');
  return name.length > FAVORITE_NAME_MAX ? `${name.slice(0, FAVORITE_NAME_MAX - 1)}…` : name;
}

/** The icon for a view: hash for tags only, else by the first thing that is set. */
export function suggestFavoriteIcon(view: FavoriteView): FavoriteIcon {
  if (view.tagIds?.length && !view.priority && !view.status && !view.due && !view.archived) {
    return 'hash';
  }
  if (view.priority?.length) return 'flag';
  if (view.due && view.due !== 'any') return 'calendar';
  if (view.status?.length) return 'progress';
  if (view.archived) return 'archive';
  return view.tagIds?.length ? 'hash' : 'star';
}
