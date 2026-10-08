import { DUE_FILTERS, GROUP_KEYS, SORT_KEYS, type TaskSearch } from './filters';

const isString = (value: unknown): value is string => typeof value === 'string';

const strings = (value: unknown): string[] | undefined => {
  const list = (Array.isArray(value) ? value : [value]).filter(isString);
  return list.length > 0 ? list : undefined;
};

const STATUSES = ['todo', 'doing', 'done'] as const;
const PRIORITIES = [1, 2, 3, 4] as const;

/**
 * Checks the URL search params of /tasks/my-tasks and keeps only what is valid, so a bad or old
 * link opens the page with fewer filters instead of failing. Favorites open My tasks this way.
 */
export function validateTaskSearch(raw: Record<string, unknown>): TaskSearch {
  const search: TaskSearch = {};
  const status = strings(raw.status)?.filter((s): s is (typeof STATUSES)[number] =>
    (STATUSES as readonly string[]).includes(s),
  );
  if (status?.length) search.status = status;
  const priority = (Array.isArray(raw.priority) ? raw.priority : [raw.priority])
    .map(Number)
    .filter((p): p is (typeof PRIORITIES)[number] => (PRIORITIES as readonly number[]).includes(p));
  if (priority.length) search.priority = priority;
  const tag = strings(raw.tag);
  if (tag) search.tag = tag;
  if (isString(raw.due) && (DUE_FILTERS as readonly string[]).includes(raw.due)) {
    search.due = raw.due as TaskSearch['due'];
  }
  if (raw.archived === true || raw.archived === 'true') search.archived = true;
  if (isString(raw.group) && (GROUP_KEYS as readonly string[]).includes(raw.group)) {
    search.group = raw.group as TaskSearch['group'];
  }
  if (isString(raw.sort) && (SORT_KEYS as readonly string[]).includes(raw.sort)) {
    search.sort = raw.sort as TaskSearch['sort'];
  }
  if (isString(raw.task) && raw.task.length > 0) search.task = raw.task;
  return search;
}
