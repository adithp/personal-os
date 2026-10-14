import type { Project } from '@personal-os/shared';
import { cx, GlassCard } from '@personal-os/ui';
import { useMemo } from 'react';
import { Loading } from '../components';
import { accentOf, formatDay, formatDayShort } from '../format';
import { useMilestones, useProjectTasks } from '../projects-queries';
import { buildTimeline, positionPercent } from './timeline-math';

const LABEL_COLUMN = 'w-[220px] shrink-0';

/**
 * A simple timeline in plain divs: a date axis (India days) from the start date to the due date,
 * a marker for "Today", and one row per milestone or task due date.
 */
export function TimelineTab({ project, now }: { project: Project; now: number }) {
  const milestones = useMilestones(project.id);
  const tasks = useProjectTasks(project.id);
  const timeline = useMemo(
    () => buildTimeline(project, milestones.data ?? [], tasks.data ?? [], now),
    [project, milestones.data, tasks.data, now],
  );
  const accent = accentOf(project.color);
  const today = positionPercent(timeline, now);

  if (milestones.isPending || tasks.isPending) {
    return (
      <GlassCard>
        <Loading text="Loading timeline…" />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section font-medium text-fg">Timeline</h2>
        <p className="text-small text-fg-muted">
          {project.startAt ? formatDay(project.startAt) : 'No start date'}
          {' to '}
          {project.dueAt ? formatDay(project.dueAt) : 'no due date'}
        </p>
      </div>

      <div role="group" aria-label={`Timeline from ${formatDayShort(timeline.start)} to ${formatDayShort(timeline.end)}, ${String(timeline.items.length)} items`} className="relative flex flex-col">
        {/* The axis: day labels */}
        <div className="flex">
          <div className={LABEL_COLUMN} />
          <div className="relative h-5 min-w-0 flex-1 border-b-[0.5px] border-glass-border">
            {timeline.ticks.map((tick) => (
              <span
                key={tick}
                className="absolute -translate-x-1/2 text-small whitespace-nowrap text-fg-muted first:translate-x-0 last:-translate-x-full"
                style={{ left: `${String(positionPercent(timeline, tick))}%` }}
              >
                {formatDayShort(tick)}
              </span>
            ))}
          </div>
        </div>

        {timeline.items.length === 0 ? (
          <p className="py-3 text-body text-fg-muted">
            Nothing dated yet. Give milestones or tasks a due date to see them here.
          </p>
        ) : (
          timeline.items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="flex h-8 items-center">
              <div className={cx(LABEL_COLUMN, 'flex items-center gap-2 pr-3')}>
                <span
                  className={cx(
                    'truncate text-body',
                    item.done ? 'text-fg-muted line-through' : 'text-fg',
                  )}
                >
                  {item.title}
                </span>
              </div>
              <div className="relative h-full min-w-0 flex-1">
                <span
                  className="absolute top-1/2 h-px w-full bg-glass-border"
                  aria-hidden
                />
                <span
                  data-kind={item.kind}
                  title={`${item.kind === 'milestone' ? 'Milestone' : 'Task'}: ${item.title}, ${formatDay(new Date(item.at).toISOString())}`}
                  className={cx(
                    'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 border-[1.5px]',
                    item.kind === 'milestone' ? 'rotate-45 rounded-[3px]' : 'rounded-full',
                    item.done ? 'border-transparent' : 'border-fg-muted bg-transparent',
                  )}
                  style={{
                    left: `${String(positionPercent(timeline, item.at))}%`,
                    ...(item.done ? { backgroundColor: accent } : {}),
                  }}
                />
              </div>
              <span className="w-16 shrink-0 pl-2 text-right text-small text-fg-muted">
                {formatDayShort(item.at)}
              </span>
            </div>
          ))
        )}

        {/* Today marker over the track area */}
        <div className="pointer-events-none absolute top-0 right-16 bottom-0 left-[220px]" aria-hidden>
          <div
            data-testid="today-marker"
            className="absolute top-0 bottom-0 w-px bg-accent"
            style={{ left: `${String(today)}%` }}
          >
            <span className="absolute -top-0.5 left-1 rounded-chip bg-accent px-1 text-small text-on-tile">
              Today
            </span>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-4 text-small text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rotate-45 rounded-[2px] border-[1.5px] border-fg-muted" />
          Milestone
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-fg-muted" />
          Task due date
        </span>
      </p>
    </GlassCard>
  );
}
