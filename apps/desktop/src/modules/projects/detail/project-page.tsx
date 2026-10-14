import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from '@personal-os/shared';
import { Button, IconButton, SegmentedControl } from '@personal-os/ui';
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { BoardView } from '../../tasks/board/board-view';
import { TaskDetailPanel } from '../../tasks/detail/task-detail-panel';
import { Popover, PopoverItem } from '../../tasks/detail/popover';
import { useTasksUi } from '../../tasks/tasks-ui-store';
import { ConfirmDialog, Loading, QueryError, StatusBadge } from '../components';
import { ProjectFormDialog } from '../dialogs/project-form';
import { accentOf } from '../format';
import { useProject, useProjectActions, useProjectTasks } from '../projects-queries';
import { PROJECT_TABS, useProjectsUi, type ProjectTab } from '../projects-ui-store';
import { RunningTimer } from '../time/time-parts';
import { ProjectTimeTab } from '../time/project-time-tab';
import { NotesTab } from './notes-tab';
import { OverviewTab } from './overview-tab';
import { TasksTab } from './tasks-tab';
import { TimelineTab } from './timeline-tab';

const TAB_LABELS: Record<ProjectTab, string> = {
  overview: 'Overview',
  tasks: 'Tasks',
  notes: 'Notes',
  board: 'Board',
  timeline: 'Timeline',
  time: 'Time',
};
const TAB_OPTIONS = PROJECT_TABS.map((value) => ({ value, label: TAB_LABELS[value] }));

/** The Board tab: the project's tasks in To do, In progress and Done; drag to change the status. */
function BoardTab({ projectId, now }: { projectId: string; now: Date }) {
  const tasks = useProjectTasks(projectId);
  if (tasks.isPending) return <Loading text="Loading tasks…" />;
  if (tasks.isError) {
    return (
      <QueryError
        error={tasks.error}
        fallback="Could not load the tasks."
        onRetry={() => {
          void tasks.refetch();
        }}
      />
    );
  }
  const shown = tasks.data.filter((task) => task.archivedAt === null || task.status === 'done');
  if (shown.length === 0) {
    return (
      <p className="px-1 text-body text-fg-muted">
        No tasks in this project yet. Add some on the Tasks tab.
      </p>
    );
  }
  return <BoardView tasks={shown} now={now} manualSort={false} />;
}

function StatusMenu({ project }: { project: Project }) {
  const { setStatus } = useProjectActions();
  return (
    <Popover
      label="Change status"
      popupLabel="Status"
      triggerClassName="inline-flex items-center gap-1 rounded-chip"
      trigger={
        <>
          <StatusBadge status={project.status} />
          <IconChevronDown size={14} className="text-fg-muted" aria-hidden />
        </>
      }
    >
      {(close) =>
        PROJECT_STATUSES.map((status: ProjectStatus) => (
          <PopoverItem
            key={status}
            role="menuitemradio"
            checked={status === project.status}
            onSelect={() => {
              close();
              if (status !== project.status) setStatus.mutate({ id: project.id, status });
            }}
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              {status === project.status ? <IconCheck size={14} aria-hidden /> : null}
            </span>
            <span>{PROJECT_STATUS_LABELS[status]}</span>
          </PopoverItem>
        ))
      }
    </Popover>
  );
}

/** The project page: header with status menu, tabs, and the tab content. */
export function ProjectPage({ projectId }: { projectId: string }) {
  const query = useProject(projectId);
  const { remove } = useProjectActions();
  const tab = useProjectsUi((state) => state.tab);
  const setTab = useProjectsUi((state) => state.setTab);
  const closeProject = useProjectsUi((state) => state.closeProject);
  const selectedTaskId = useTasksUi((state) => state.selectedTaskId);
  const select = useTasksUi((state) => state.select);
  const [now, setNow] = useState(() => new Date());
  // Keep "today" and "overdue" right when the app stays open past midnight
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // A task opened on another page must not pop open here
  useEffect(() => {
    select(null);
  }, [projectId, select]);

  const back = (
    <Button variant="secondary" onClick={closeProject}>
      <IconArrowLeft size={16} stroke={1.5} aria-hidden />
      All projects
    </Button>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4 px-4">
        <div>{back}</div>
        <Loading text="Loading project…" />
      </div>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-col gap-4 px-4">
        <div>{back}</div>
        {missing ? (
          <p role="alert" className="text-body text-fg-muted">
            This project does not exist any more.
          </p>
        ) : (
          <QueryError
            error={query.error}
            fallback="Could not load the project."
            onRetry={() => {
              void query.refetch();
            }}
          />
        )}
      </div>
    );
  }

  const project = query.data;
  const panelOpen = (tab === 'tasks' || tab === 'board') && selectedTaskId !== null;

  return (
    <div className="flex h-full min-h-0 gap-4 px-4 pb-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <header className="flex flex-col gap-3">
          <div>{back}</div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="size-[18px] shrink-0 rounded-full"
                style={{ backgroundColor: accentOf(project.color) }}
              />
              <h1 className="min-w-0 truncate text-page font-semibold text-fg">{project.title}</h1>
              <StatusMenu project={project} />
            </div>
            <div className="flex items-center gap-2">
              <RunningTimer compact />
              <IconButton
                aria-label="Edit project"
                icon={<IconPencil size={16} aria-hidden />}
                onClick={() => {
                  setEditing(true);
                }}
              />
              <IconButton
                aria-label="Delete project"
                icon={<IconTrash size={16} aria-hidden />}
                onClick={() => {
                  setConfirming(true);
                }}
              />
            </div>
          </div>
          <div>
            <SegmentedControl
              label="Project sections"
              value={tab}
              options={TAB_OPTIONS}
              onChange={setTab}
            />
          </div>
        </header>

        {tab === 'overview' ? <OverviewTab project={project} now={now.getTime()} /> : null}
        {tab === 'tasks' ? <TasksTab project={project} now={now} /> : null}
        {tab === 'notes' ? <NotesTab project={project} /> : null}
        {tab === 'board' ? <BoardTab projectId={project.id} now={now} /> : null}
        {tab === 'timeline' ? <TimelineTab project={project} now={now.getTime()} /> : null}
        {tab === 'time' ? <ProjectTimeTab projectId={project.id} /> : null}
      </div>

      {panelOpen ? (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => {
            select(null);
          }}
        />
      ) : null}

      {editing ? (
        <ProjectFormDialog
          project={project}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title="Delete project?"
          message={`"${project.title}" will be deleted. Its tasks and notes stay. You can undo it for a few seconds.`}
          confirmLabel="Delete"
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            closeProject();
            remove.mutate(project.id);
          }}
        />
      ) : null}
    </div>
  );
}
