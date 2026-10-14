import type { RealtimeKeys } from '../../realtime/registry';
import { FAVORITES_KEY, GOALS_KEY, TAGS_KEY, TASKS_KEY } from './query-keys';

/** Which cached queries go stale when a Tasks table changes (research memo realtime.md D5). */
export const tasksRealtimeKeys: RealtimeKeys = {
  tasks: [TASKS_KEY],
  tags: [TAGS_KEY, TASKS_KEY],
  // A task's tags live here, and tags carry their task count
  entity_tags: [TASKS_KEY, TAGS_KEY],
  task_favorites: [FAVORITES_KEY],
  // Blockers
  links: [TASKS_KEY],
  // Tasks carry their goal
  goals: [GOALS_KEY, TASKS_KEY],
};
