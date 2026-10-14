import type { RealtimeKeys } from '../../realtime/registry';
import { TASKS_KEY } from '../tasks/query-keys';
import { CLIENTS_KEY, MILESTONES_KEY, PROJECTS_KEY, TIME_KEY } from './query-keys';

/** Which cached queries go stale when a Projects table changes. */
export const projectsRealtimeKeys: RealtimeKeys = {
  // Clients carry their project count and hours; projects carry their client
  clients: [CLIENTS_KEY, PROJECTS_KEY],
  projects: [PROJECTS_KEY, CLIENTS_KEY, TIME_KEY, TASKS_KEY],
  // Projects carry their milestone progress
  project_milestones: [MILESTONES_KEY, PROJECTS_KEY],
  // Projects and clients carry tracked time
  time_entries: [TIME_KEY, PROJECTS_KEY, CLIENTS_KEY],
  // A project's tasks and notes (and progress) change with the items and the links
  tasks: [PROJECTS_KEY, CLIENTS_KEY],
  notes: [PROJECTS_KEY],
  links: [PROJECTS_KEY, TASKS_KEY],
};
