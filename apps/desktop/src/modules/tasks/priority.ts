import { TASK_PRIORITY_LABELS, type TaskPriority } from '@personal-os/shared';
import { moduleColorVar } from '@personal-os/ui';

/** The small dot beside a task. Low priority (4) has no dot, to keep the list quiet. */
export function priorityColor(priority: TaskPriority): string | null {
  switch (priority) {
    case 1:
      return 'var(--danger)';
    case 2:
      return moduleColorVar('calendar'); // orange
    case 3:
      return moduleColorVar('tasks'); // yellow
    case 4:
      return null;
  }
}

export const priorityLabel = (priority: TaskPriority) => TASK_PRIORITY_LABELS[priority];
