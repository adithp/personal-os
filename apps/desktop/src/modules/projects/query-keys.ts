/** Every cached clients query starts with this key. */
export const CLIENTS_KEY = ['clients'] as const;
/** Every cached projects query (lists, details, notes of a project, a task's project) starts with this key. */
export const PROJECTS_KEY = ['projects'] as const;
/** Every cached milestones query starts with this key. */
export const MILESTONES_KEY = ['project-milestones'] as const;
/** Every cached time query (entries, the running timer, summaries) starts with this key. */
export const TIME_KEY = ['time-entries'] as const;
