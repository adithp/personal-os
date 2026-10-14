import {
  formatDuration,
  progressPercent,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from '@personal-os/shared';
import { Button, GlassCard, SegmentedControl } from '@personal-os/ui';
import { IconBriefcase, IconCalendar, IconClock, IconPlus, IconUser } from '@tabler/icons-react';
import { useState } from 'react';
import { Loading, ProjectBar, QueryError, StatusBadge } from '../components';
import { accentOf, formatDay, isOverdue, progressText } from '../format';
import { useProjects } from '../projects-queries';
import { useProjectsUi } from '../projects-ui-store';

type Filter = 'all' | ProjectStatus;

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] })),
];

/** One project as a glass card. The title button is stretched over the whole card. */
export function ProjectCard({ project, now }: { project: Project; now: number }) {
  const openProject = useProjectsUi((state) => state.openProject);
  const percent = progressPercent(project.progress);
  const overdue = isOverdue(project, now);
  const accent = accentOf(project.color);
  return (
    <li className="relative flex flex-col gap-3 rounded-card glass p-4 transition-transform duration-150 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 size-[14px] shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <button
          type="button"
          data-project-row
          data-project-id={project.id}
          onClick={() => {
            openProject(project.id);
          }}
          className="line-clamp-2 min-w-0 flex-1 text-left text-body font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
        >
          {project.title}
        </button>
        <StatusBadge status={project.status} />
      </div>

      {project.client ? (
        <p className="flex items-center gap-1.5 text-small text-fg-secondary">
          <IconUser size={14} stroke={1.5} aria-hidden />
          <span className="truncate">{project.client.name}</span>
        </p>
      ) : null}

      {percent === null ? (
        <p className="text-small text-fg-secondary">No tasks yet</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <ProjectBar
            percent={percent}
            color={accent}
            label={`Tasks done: ${String(project.progress.done)} of ${String(project.progress.total)}`}
            valueText={progressText(project.progress)}
          />
          <div className="flex items-center justify-between text-small text-fg-secondary">
            <span>{progressText(project.progress)}</span>
            <span>{String(percent)}%</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-small">
        <span
          className={
            overdue
              ? 'flex items-center gap-1.5 text-danger'
              : 'flex items-center gap-1.5 text-fg-secondary'
          }
        >
          <IconCalendar size={14} stroke={1.5} aria-hidden />
          {project.dueAt
            ? `${overdue ? 'Overdue: ' : 'Due '}${formatDay(project.dueAt)}`
            : 'No due date'}
        </span>
        <span className="flex items-center gap-1.5 text-fg-secondary">
          <IconClock size={14} stroke={1.5} aria-hidden />
          {formatDuration(project.trackedSeconds)}
        </span>
      </div>
    </li>
  );
}

/** The projects list: a status filter, a grid of project cards, and "New project". */
export function ProjectsList({ onNew, onHelp }: { onNew: () => void; onHelp: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [now] = useState(() => Date.now());
  const projects = useProjects();
  const all = projects.data ?? [];
  const shown = filter === 'all' ? all : all.filter((project) => project.status === filter);
  const activeCount = all.filter((project) => project.status === 'active').length;

  const newButton = (
    <Button variant="secondary" onClick={onNew}>
      <IconPlus size={16} stroke={1.5} aria-hidden />
      New project
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-4 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page font-semibold text-fg">Projects</h1>
          <p className="min-h-[15px] text-small text-fg-muted">
            {projects.isSuccess && all.length > 0 ? `${String(activeCount)} active` : ' '}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Project status"
            value={filter}
            options={FILTERS}
            onChange={setFilter}
          />
          {newButton}
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={onHelp}
            className="h-[30px] min-h-6 min-w-6 rounded-control px-2 text-body text-fg-muted focus-ring hover:bg-input hover:text-fg"
          >
            ?
          </button>
        </div>
      </header>

      {projects.isError ? (
        <QueryError
          error={projects.error}
          fallback="Could not load your projects."
          onRetry={() => {
            void projects.refetch();
          }}
        />
      ) : null}
      {projects.isPending ? <Loading text="Loading projects…" /> : null}

      {projects.isSuccess && shown.length === 0 ? (
        all.length === 0 ? (
          <GlassCard className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-module-projects text-on-tile">
              <IconBriefcase size={20} stroke={1.5} aria-hidden />
            </span>
            <h2 className="text-section font-medium text-fg">No projects yet</h2>
            <p className="text-body text-fg-muted">
              A project groups tasks, notes, milestones and tracked time for one piece of work.
            </p>
            {newButton}
          </GlassCard>
        ) : (
          <p role="status" className="px-1 text-body text-fg-muted">
            No projects with this status
          </p>
        )
      ) : null}

      {shown.length > 0 ? (
        <ul
          aria-label="Projects"
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
        >
          {shown.map((project) => (
            <ProjectCard key={project.id} project={project} now={now} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
