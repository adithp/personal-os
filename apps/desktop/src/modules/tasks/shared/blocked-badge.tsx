import type { TaskBlocker } from '@personal-os/shared';
import { IconLock } from '@tabler/icons-react';

export interface BlockedBadgeProps {
  blockedBy: readonly TaskBlocker[];
}

/** "Blocked" badge; the tooltip text lists the blocking tasks. Renders nothing when not blocked. */
export function BlockedBadge({ blockedBy }: BlockedBadgeProps) {
  if (blockedBy.length === 0) return null;
  const names = blockedBy.map((blocker) => blocker.title).join(', ');
  return (
    <span
      title={`Blocked by: ${names}`}
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-[8px] bg-input px-2 text-small font-medium text-fg-secondary"
    >
      <IconLock size={11} aria-hidden />
      Blocked
      <span className="sr-only">by {names}</span>
    </span>
  );
}
