import type { Task } from '@personal-os/shared';

/** The collapsible groups under the open tasks. */
export type GroupId = 'done' | 'archived';

/** Unique key of a task row on the goal page. */
export const itemKeyOf = (task: Task) => `goal/${task.id}`;
