import type { ModuleId } from '@personal-os/shared';
import { GlassCard, moduleColorVar } from '@personal-os/ui';

export interface UpcomingEvent {
  day: 'today' | 'tomorrow';
  time: string;
  title: string;
  module: ModuleId;
  /** Only the next event shows "in N min". */
  minutesUntil?: number;
}

/** Most events the card shows. */
export const MAX_UPCOMING = 4;

const GROUPS = [
  { day: 'today', label: 'Today' },
  { day: 'tomorrow', label: 'Tomorrow' },
] as const;

export interface UpcomingCardProps {
  events: readonly UpcomingEvent[];
}

/** Next events grouped by Today and Tomorrow, each with a thin bar in its module color. */
export function UpcomingCard({ events }: UpcomingCardProps) {
  const shown = events.slice(0, MAX_UPCOMING);

  return (
    <GlassCard padding="compact" className="flex flex-col gap-3">
      <h2 className="text-card font-semibold text-fg">Upcoming</h2>
      {shown.length === 0 && <p className="text-small text-fg-muted">Nothing coming up.</p>}
      {GROUPS.map(({ day, label }) => {
        const group = shown.filter((event) => event.day === day);
        if (group.length === 0) return null;
        return (
          <section key={day} aria-label={label} className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-fg-muted">{label}</h3>
            <ul role="list" className="flex flex-col gap-2">
              {group.map((event) => (
                <li key={`${event.time}-${event.title}`} className="flex items-stretch gap-2">
                  <span
                    data-testid="event-bar"
                    data-module={event.module}
                    aria-hidden
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ backgroundColor: moduleColorVar(event.module) }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-fg">{event.title}</p>
                    <p className="truncate text-small text-fg-secondary">
                      {event.time}
                      {event.minutesUntil !== undefined && (
                        <span className="text-fg-muted"> · in {event.minutesUntil} min</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </GlassCard>
  );
}
