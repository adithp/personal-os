import type { Task } from '@personal-os/shared';
import { inboxTasks } from '../sections';
import { useOpenTasks } from '../tasks-queries';

/**
 * The Inbox (docs/design/research/tasks-inbox.md): open top-level tasks with no due date and no
 * tags. It comes from the open-tasks cache, so an optimistic change (a date, a tag, done, archive)
 * removes the row at once and the side panel count follows.
 */
export function useInbox() {
  const open = useOpenTasks();
  const tasks: Task[] = open.data ? inboxTasks(open.data) : [];
  return {
    tasks,
    count: tasks.length,
    isPending: open.isPending,
    isError: open.isError,
    error: open.error,
    refetch: open.refetch,
  };
}
