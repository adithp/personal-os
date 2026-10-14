import { formatDuration, progressPercent, type Project } from '@personal-os/shared';
import { GlassCard } from '@personal-os/ui';
import { Link } from '@tanstack/react-router';
import { ProjectBar } from '../components';
import { accentOf, formatDay, isOverdue, progressText } from '../format';
import { useProjectNotes } from '../projects-queries';
import { useProjectsUi } from '../projects-ui-store';
import { MilestonesCard } from './milestones-card';

function Stat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-small text-fg-muted">{label}</dt>
      <dd className={danger ? 'truncate text-body text-danger' : 'truncate text-body text-fg'}>
        {value}
      </dd>
    </div>
  );
}

/** The Overview tab: progress, key facts, description, milestones and the latest notes. */
export function OverviewTab({ project, now }: { project: Project; now: number }) {
  const notes = useProjectNotes(project.id);
  const openClient = useProjectsUi((state) => state.openClient);
  const percent = progressPercent(project.progress);
  const overdue = isOverdue(project, now);
  const latest = (notes.data ?? []).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-3">
        <h2 className="text-section font-medium text-fg">Progress</h2>
        {percent === null ? (
          <p className="text-body text-fg-secondary">
            No tasks yet. Progress follows the tasks of the project.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <ProjectBar
              percent={percent}
              color={accentOf(project.color)}
              label={`Tasks done: ${String(project.progress.done)} of ${String(project.progress.total)}`}
              valueText={progressText(project.progress)}
            />
            <div className="flex items-center justify-between text-small text-fg-secondary">
              <span>{progressText(project.progress)}</span>
              <span>{String(percent)}%</span>
            </div>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Milestones"
            value={
              project.milestones.total === 0
                ? 'None'
                : `${String(project.milestones.done)} of ${String(project.milestones.total)}`
            }
          />
          <Stat label="Start" value={project.startAt ? formatDay(project.startAt) : 'Not set'} />
          <Stat
            label={overdue ? 'Overdue since' : 'Due'}
            value={project.dueAt ? formatDay(project.dueAt) : 'Not set'}
            danger={overdue}
          />
          <Stat label="Tracked time" value={formatDuration(project.trackedSeconds)} />
        </dl>
        {project.client ? (
          <p className="text-body text-fg-secondary">
            {'Client: '}
            <button
              type="button"
              onClick={() => {
                if (project.client) openClient(project.client.id);
              }}
              className="rounded-chip text-fg underline-offset-2 focus-ring hover:underline"
            >
              {project.client.name}
            </button>
          </p>
        ) : null}
      </GlassCard>

      {project.description ? (
        <GlassCard className="flex flex-col gap-2">
          <h2 className="text-section font-medium text-fg">Description</h2>
          <p className="text-body whitespace-pre-wrap text-fg-secondary">{project.description}</p>
        </GlassCard>
      ) : null}

      <MilestonesCard projectId={project.id} />

      <GlassCard className="flex flex-col gap-2">
        <h2 className="text-section font-medium text-fg">Notes</h2>
        {notes.isSuccess && latest.length === 0 ? (
          <p className="text-body text-fg-muted">
            No notes linked yet. Link notes on the Notes tab.
          </p>
        ) : null}
        {latest.length > 0 ? (
          <ul aria-label="Latest notes" className="flex flex-col">
            {latest.map((note) => (
              <li key={note.id}>
                <Link
                  to="/notes"
                  search={{ note: note.id }}
                  className="flex min-h-8 items-center justify-between gap-2 rounded-chip px-2 text-body text-fg focus-ring hover:bg-input"
                >
                  <span className="truncate">{note.title}</span>
                  <span className="shrink-0 text-small text-fg-muted">
                    {formatDay(note.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </GlassCard>
    </div>
  );
}
