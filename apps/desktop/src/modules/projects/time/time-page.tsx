import { formatDuration, type TimeSummary } from '@personal-os/shared';
import { useProjects, useTimeEntries, useTimeSummary } from '../projects-queries';
import { Loading, QueryError, Select } from '../components';
import { formatDayShort } from '../format';
import { useState } from 'react';
import { EntryList, RunningTimer, Section, StartTimer } from './time-parts';

/** A horizontal bar whose width is `seconds` over `max`, in the Projects color. */
function Bar({ label, seconds, max }: { label: string; seconds: number; max: number }) {
  const width = max > 0 ? Math.max(seconds > 0 ? 2 : 0, (seconds / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-body text-fg-secondary">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-progress-track">
        <div
          className="h-full rounded-full bg-module-projects"
          style={{ width: `${String(width)}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-body text-fg tabular-nums">
        {formatDuration(seconds)}
      </span>
    </li>
  );
}

function Totals({ summary }: { summary: TimeSummary }) {
  const projectMax = Math.max(0, ...summary.byProject.map((row) => row.seconds));
  const weekMax = Math.max(0, ...summary.byWeek.map((row) => row.seconds));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Per project">
        {summary.byProject.length === 0 ? (
          <p className="text-body text-fg-muted">Nothing tracked in this period.</p>
        ) : (
          <ul aria-label="Time per project" className="flex flex-col gap-2">
            {summary.byProject.map((row) => (
              <Bar key={row.projectId} label={row.title} seconds={row.seconds} max={projectMax} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="Per week">
        <ul aria-label="Time per week" className="flex flex-col gap-2">
          {summary.byWeek.map((row) => (
            <Bar
              key={row.weekStart}
              label={`Week of ${formatDayShort(row.weekStart)}`}
              seconds={row.seconds}
              max={weekMax}
            />
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** The Time page: the running timer, a start form, totals per project and per week, recent entries. */
export function TimePage() {
  const summary = useTimeSummary(undefined, 8);
  const entries = useTimeEntries({ limit: 30 });
  const projects = useProjects();
  const [projectId, setProjectId] = useState('');
  const active = (projects.data ?? []).filter((project) => project.status === 'active');
  const chosen = projectId || active[0]?.id || '';

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-4 pb-4">
      <header>
        <h1 className="text-page font-semibold text-fg">Time</h1>
        <p className="min-h-[15px] text-small text-fg-muted">
          {summary.isSuccess ? `${formatDuration(summary.data.totalSeconds)} in the last 8 weeks` : ' '}
        </p>
      </header>

      <RunningTimer />

      <Section title="Start a timer">
        {active.length === 0 ? (
          <p className="text-body text-fg-muted">
            {projects.isPending ? 'Loading projects…' : 'No active projects. Create one first.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="max-w-xs">
              <Select
                aria-label="Project"
                value={chosen}
                onChange={(event) => {
                  setProjectId(event.target.value);
                }}
              >
                {active.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </Select>
            </div>
            <StartTimer key={chosen} projectId={chosen} />
          </div>
        )}
      </Section>

      {summary.isPending ? <Loading text="Loading totals…" /> : null}
      {summary.isError ? (
        <QueryError
          error={summary.error}
          fallback="Could not load the totals."
          onRetry={() => {
            void summary.refetch();
          }}
        />
      ) : null}
      {summary.isSuccess ? <Totals summary={summary.data} /> : null}

      <Section title="Recent entries">
        {entries.isPending ? <Loading text="Loading entries…" /> : null}
        {entries.isError ? (
          <QueryError
            error={entries.error}
            fallback="Could not load the entries."
            onRetry={() => {
              void entries.refetch();
            }}
          />
        ) : null}
        {entries.isSuccess && entries.data.length === 0 ? (
          <p className="text-body text-fg-muted">No time tracked yet.</p>
        ) : null}
        {entries.isSuccess && entries.data.length > 0 ? (
          <EntryList entries={entries.data} showProject />
        ) : null}
      </Section>
    </div>
  );
}
