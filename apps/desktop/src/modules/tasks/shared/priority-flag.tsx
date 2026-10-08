import type { TaskPriority } from '@personal-os/shared';
import { IconFlag3Filled } from '@tabler/icons-react';
import { priorityColor, priorityLabel } from '../priority';

export interface PriorityFlagProps {
  priority: TaskPriority;
  size?: number;
}

/** A small flag for Urgent, High, and Medium. Low priority shows nothing, to keep things quiet. */
export function PriorityFlag({ priority, size = 14 }: PriorityFlagProps) {
  const color = priorityColor(priority);
  if (!color) return null;
  return (
    <span
      role="img"
      aria-label={`${priorityLabel(priority)} priority`}
      className="inline-flex shrink-0"
      style={{ color }}
    >
      <IconFlag3Filled size={size} aria-hidden />
    </span>
  );
}
