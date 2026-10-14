import { TASK_TITLE_MAX, type Project, type Task } from '@personal-os/shared';
import { cx, GlassCard, IconButton, Input } from '@personal-os/ui';
import { IconLink, IconSearch, IconUnlink } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../api/api-client';
import { DueLabel } from '../../tasks/shared/due-label';
import { TaskCheckbox } from '../../tasks/shared/task-checkbox';
import { useOpenTasks, useTaskActions } from '../../tasks/tasks-queries';
import { useTasksUi } from '../../tasks/tasks-ui-store';
import { Loading, QueryError } from '../components';
import { useProjectActions, useProjectTasks } from '../projects-queries';

const OPTION = '[role="option"]';

/** "Add existing task": a popover with a search box over the open tasks; choosing one links it. */
function AddExistingPopover({ project, linked }: { project: Project; linked: ReadonlySet<string> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const tasks = useOpenTasks();
  const { setTaskProject } = useProjectActions();

  const close = () => {
    setOpen(false);
    setQuery('');
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const all = (tasks.data ?? []).filter((task) => !linked.has(task.id));
  const needle = query.trim().toLowerCase();
  const shown = needle ? all.filter((task) => task.title.toLowerCase().includes(needle)) : all;

  const choose = (task: Task) => {
    setTaskProject.mutate({
      taskId: task.id,
      projectId: project.id,
      message: `Added to ${project.title}.`,
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const options = [...(list.current?.querySelectorAll<HTMLElement>(OPTION) ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      options[index + 1 < options.length ? index + 1 : 0]?.focus();
    } else if (event.key === 'ArrowUp' && index >= 0) {
      event.preventDefault();
      if (index === 0) search.current?.focus();
      else options[index - 1]?.focus();
    } else if (event.key === 'Enter' && document.activeElement === search.current) {
      const first = shown[0];
      if (first) {
        event.preventDefault();
        choose(first);
      }
    }
  };

  return (
    <div ref={wrapper} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="inline-flex h-[34px] items-center justify-center gap-2 rounded-control glass px-4 text-body font-medium text-fg focus-ring transition-colors duration-150 ease-out hover:bg-input motion-reduce:transition-none"
      >
        <IconLink size={14} stroke={1.5} aria-hidden />
        Add existing task
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="Add existing tasks to this project"
          className="absolute top-full right-0 z-30 mt-1 flex w-[320px] max-w-[90vw] flex-col gap-1 rounded-card glass-strong p-1.5"
        >
          <label className="flex h-[34px] items-center gap-2 rounded-control bg-input px-2.5">
            <IconSearch size={14} stroke={1.5} className="shrink-0 text-fg-muted" aria-hidden />
            <input
              ref={search}
              type="text"
              aria-label="Search open tasks"
              placeholder="Search open tasks"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
          <div
            ref={list}
            role="listbox"
            aria-label="Open tasks"
            className="flex max-h-64 flex-col overflow-y-auto"
          >
            {shown.map((task) => (
              <button
                key={task.id}
                type="button"
                role="option"
                aria-selected={false}
                tabIndex={-1}
                onClick={() => {
                  choose(task);
                }}
                className="flex min-h-7 items-center gap-2 rounded-chip px-2 py-1 text-left text-body text-fg focus-ring hover:bg-input focus-visible:bg-input"
              >
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
              </button>
            ))}
          </div>
          {tasks.isPending ? (
            <p role="status" className="px-2 py-1.5 text-small text-fg-secondary">
              Loading tasks…
            </p>
          ) : null}
          {tasks.isError ? (
            <p role="alert" className="px-2 py-1.5 text-small text-fg-secondary">
              {tasks.error instanceof ApiError ? tasks.error.message : 'Could not load your tasks.'}
            </p>
          ) : null}
          {tasks.isSuccess && shown.length === 0 ? (
            <p className="px-2 py-1.5 text-small text-fg-muted">
              {all.length === 0 ? 'No other open tasks.' : 'No matching tasks.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  project,
  now,
}: {
  task: Task;
  project: Project;
  now: Date;
}) {
  const { complete, update } = useTaskActions();
  const { setTaskProject } = useProjectActions();
  const selectedId = useTasksUi((state) => state.selectedTaskId);
  const select = useTasksUi((state) => state.select);
  const done = task.status === 'done';
  return (
    <li
      data-task-id={task.id}
      className={cx(
        'group flex min-h-9 items-center gap-2 rounded-chip px-2 hover:bg-input',
        selectedId === task.id && 'bg-input',
      )}
    >
      <TaskCheckbox
        task={task}
        onToggle={() => {
          if (done) update.mutate({ id: task.id, status: 'todo' });
          else complete.mutate(task.id);
        }}
      />
      <button
        type="button"
        onClick={() => {
          select(task.id);
        }}
        className={cx(
          'min-w-0 flex-1 truncate rounded-chip text-left text-body focus-ring',
          done ? 'text-fg-muted line-through' : 'text-fg',
        )}
      >
        {task.title}
      </button>
      {task.dueAt ? <DueLabel task={task} now={now} /> : null}
      <IconButton
        aria-label={`Remove from project: ${task.title}`}
        icon={<IconUnlink size={14} aria-hidden />}
        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={() => {
          setTaskProject.mutate({
            taskId: task.id,
            projectId: null,
            message: `Removed from ${project.title}.`,
          });
        }}
      />
    </li>
  );
}

/** The Tasks tab: the linked tasks, a box to create a task in the project, and a picker for existing ones. */
export function TasksTab({ project, now }: { project: Project; now: Date }) {
  const tasks = useProjectTasks(project.id);
  const { create } = useTaskActions();
  const { setTaskProject } = useProjectActions();
  const [title, setTitle] = useState('');

  const list = (tasks.data ?? []).filter((task) => task.archivedAt === null || task.status === 'done');
  const open = list.filter((task) => task.status !== 'done');
  const done = list.filter((task) => task.status === 'done');
  const linked = new Set((tasks.data ?? []).map((task) => task.id));

  const add = async () => {
    const text = title.trim();
    if (text === '') return;
    setTitle('');
    try {
      const { item } = await create.mutateAsync({ title: text });
      await setTaskProject.mutateAsync({
        taskId: item.id,
        projectId: project.id,
        message: `Added to ${project.title}.`,
      });
    } catch {
      // Both hooks showed the server's message in a toast
      setTitle(text);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="New task in this project"
          placeholder="Add a task to this project"
          value={title}
          maxLength={TASK_TITLE_MAX}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void add();
            }
          }}
        />
        <AddExistingPopover project={project} linked={linked} />
      </div>

      {tasks.isPending ? <Loading text="Loading tasks…" /> : null}
      {tasks.isError ? (
        <QueryError
          error={tasks.error}
          fallback="Could not load the tasks."
          onRetry={() => {
            void tasks.refetch();
          }}
        />
      ) : null}
      {tasks.isSuccess && list.length === 0 ? (
        <p className="text-body text-fg-muted">
          No tasks in this project yet. Type above and press Enter, or add an existing task.
        </p>
      ) : null}

      {open.length > 0 ? (
        <ul aria-label="Open tasks" className="flex flex-col">
          {open.map((task) => (
            <TaskRow key={task.id} task={task} project={project} now={now} />
          ))}
        </ul>
      ) : null}
      {done.length > 0 ? (
        <section aria-label="Done tasks" className="flex flex-col gap-1">
          <h3 className="px-2 text-small font-medium text-fg-muted">{`Done (${String(done.length)})`}</h3>
          <ul className="flex flex-col">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} project={project} now={now} />
            ))}
          </ul>
        </section>
      ) : null}
    </GlassCard>
  );
}
