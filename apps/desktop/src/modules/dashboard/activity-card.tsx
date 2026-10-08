import type { ModuleId } from '@personal-os/shared';
import { ActivityItem, GlassCard } from '@personal-os/ui';
import { useState } from 'react';

export interface ActivityEntry {
  module: ModuleId;
  title: string;
  description: string;
}

/** Items shown in the card; the full list comes later. */
export const MAX_ACTIVITY = 3;

export interface ActivityCardProps {
  items: readonly ActivityEntry[];
}

/** The latest activity. "View all" does nothing yet and says so. */
export function ActivityCard({ items }: ActivityCardProps) {
  const [clicked, setClicked] = useState(false);

  return (
    <GlassCard padding="compact" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-card font-semibold text-fg">Activity</h2>
        <button
          type="button"
          onClick={() => {
            setClicked(true);
          }}
          className="rounded-chip px-1 text-small text-fg-secondary focus-ring hover:text-fg"
        >
          View all
        </button>
      </div>
      {clicked && (
        <p role="status" className="text-small text-fg-muted">
          Coming in a later step
        </p>
      )}
      <div className="flex flex-col gap-2">
        {items.slice(0, MAX_ACTIVITY).map((item) => (
          <ActivityItem key={item.title} {...item} />
        ))}
      </div>
    </GlassCard>
  );
}
