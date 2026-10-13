/**
 * Query keys that tags and favorites both need. They live here so tags-queries.ts and
 * favorites-queries.ts do not import each other.
 */
export { TAGS_KEY, TASKS_KEY } from './tasks-queries';

/** Every cached favorites query starts with this key. */
export const FAVORITES_KEY = ['task-favorites'] as const;
