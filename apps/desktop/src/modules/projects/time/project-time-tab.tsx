import { formatDuration, type TimeEntry } from '@personal-os/shared';
import { Button } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Loading, QueryError } from '../components';
import { useProjectTasks, useTimeEntries, useTimeSummary } from '../projects-queries';
import { EntryDialog, EntryList, RunningTimer, Section, StartTimer } from './time-parts';

/** The Time tab of a project: timer, manual entry, total, and the entries of this project. */
export function ProjectTimeTab({ projectId }: { projectId: string }) {
  const entries = useTimeEntries({ projectId });
  const summary = useTimeSummary(projectId, 1);
  const tasks = useProjectTasks(projectId);
  const [dialog, setDialog] = useState<{ entry?: TimeEntry } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <RunningTimer />
      <Section title="Timer">
        <StartTimer projectId={projectId} />
      </Section>

      <Section title="Entries">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body text-fg-secondary">
            {summary.isSuccess ? `Total: ${formatDuration(summary.data.totalSeconds)}` : ' '}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setDialog({});
            }}
          >
            <IconPlus size={16} stroke={1.5} aria-hidden />
            Add time
          </Button>
        </div>
        {entries.isPending ? <Loading text="Loading time…" /> : null}
        {entries.isError ? (
          <QueryError
            error={entries.error}
            fallback="Could not load the time entries."
            onRetry={() => {
              void entries.refetch();
            }}
          />
        ) : null}
        {entries.isSuccess && entries.data.length === 0 ? (
          <p className="text-body text-fg-muted">
            No time tracked yet. Start the timer or add time by hand.
          </p>
        ) : null}
        {entries.isSuccess && entries.data.length > 0 ? (
          <EntryList
            entries={entries.data}
            showProject={false}
            onEdit={(entry) => {
              setDialog({ entry });
            }}
          />
        ) : null}
      </Section>

      {dialog ? (
        <EntryDialog
          projectId={projectId}
          {...(dialog.entry ? { entry: dialog.entry } : {})}
          tasks={tasks.data ?? []}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
