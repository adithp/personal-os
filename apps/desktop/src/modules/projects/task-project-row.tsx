import { Input } from '@personal-os/ui';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useRouter } from '@tanstack/react-router';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Popover, PopoverItem } from '../tasks/detail/popover';
import { useProjectActions, useProjects, useTaskProject } from './projects-queries';
import { useProjectsUi } from './projects-ui-store';

/** The menu shows a search box above this many projects. */
const SEARCH_FROM = 8;

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small font-medium text-fg-muted">Project</span>
      {children}
    </div>
  );
}

/**
 * The Project row of the task detail panel: the task's project as a chip that opens the project,
 * and a menu to choose another active project or to take the task out. A subtask follows its parent.
 */
export function TaskProjectRow({
  taskId,
  isSubtask = false,
}: {
  taskId: string;
  isSubtask?: boolean;
}) {
  const current = useTaskProject(isSubtask ? null : taskId);
  const projects = useProjects({ status: 'active' });
  const { setTaskProject } = useProjectActions();
  const openProject = useProjectsUi((state) => state.openProject);
  const router = useRouter({ warn: false }) as ReturnType<typeof useRouter> | undefined;
  const [query, setQuery] = useState('');

  if (isSubtask) {
    return (
      <Row>
        <p className="text-body text-fg-muted">Same project as the parent task</p>
      </Row>
    );
  }

  const project = current.data ?? null;
  const active = projects.data ?? [];
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? active.filter((candidate) => candidate.title.toLowerCase().includes(needle))
    : active;

  const choose = (projectId: string | null, title: string, close: () => void) => {
    close();
    setQuery('');
    if ((project?.id ?? null) === projectId) return;
    const message = projectId
      ? project
        ? `Moved to ${title}.`
        : `Added to ${title}.`
      : `Removed from ${project?.title ?? title}.`;
    setTaskProject.mutate({ taskId, projectId, message });
  };

  const follow = (event: MouseEvent) => {
    if (!project) return;
    event.preventDefault();
    openProject(project.id);
    void router?.navigate({ to: '/projects' });
  };

  return (
    <Row>
      <div className="flex items-center gap-1.5">
        {project ? (
          <a
            href="/projects"
            onClick={follow}
            className="inline-flex h-6 max-w-full items-center rounded-chip bg-input px-2 text-small text-fg focus-ring hover:bg-glass"
          >
            <span className="truncate">{project.title}</span>
          </a>
        ) : (
          <span className="text-body text-fg-muted">No project</span>
        )}
        <Popover
          label="Change project"
          popupLabel="Projects"
          triggerClassName="inline-flex size-6 items-center justify-center text-fg-muted hover:text-fg"
          trigger={<IconChevronDown size={14} aria-hidden />}
        >
          {(close) => (
            <>
              {active.length > SEARCH_FROM ? (
                <div className="px-1 pt-1">
                  <Input
                    data-autofocus
                    aria-label="Search projects"
                    placeholder="Search projects"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const first = shown[0];
                        if (first) choose(first.id, first.title, close);
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        event.currentTarget
                          .closest('[role="menu"]')
                          ?.querySelector<HTMLElement>('[role^="menuitem"]')
                          ?.focus();
                      }
                    }}
                  />
                </div>
              ) : null}
              <PopoverItem
                role="menuitemradio"
                checked={project === null}
                onSelect={() => {
                  choose(null, 'project', close);
                }}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {project === null ? <IconCheck size={14} aria-hidden /> : null}
                </span>
                <span>No project</span>
              </PopoverItem>
              {projects.isSuccess && active.length === 0 ? (
                <p className="px-2 py-1 text-small text-fg-muted">
                  No active projects. Create one on the Projects page.
                </p>
              ) : null}
              {needle && projects.isSuccess && active.length > 0 && shown.length === 0 ? (
                <p className="px-2 py-1 text-small text-fg-muted">No matching projects.</p>
              ) : null}
              {shown.map((candidate) => {
                const on = candidate.id === project?.id;
                return (
                  <PopoverItem
                    key={candidate.id}
                    role="menuitemradio"
                    checked={on}
                    onSelect={() => {
                      choose(candidate.id, candidate.title, close);
                    }}
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      {on ? <IconCheck size={14} aria-hidden /> : null}
                    </span>
                    <span className="truncate">{candidate.title}</span>
                  </PopoverItem>
                );
              })}
            </>
          )}
        </Popover>
      </div>
    </Row>
  );
}
