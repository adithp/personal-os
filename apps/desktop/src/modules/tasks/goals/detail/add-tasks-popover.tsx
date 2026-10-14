import type { Goal, Task } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { IconCheck, IconLink, IconSearch } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../../api/api-client';
import { useOpenTasks } from '../../tasks-queries';
import { useGoalActions } from '../goals-queries';

const OPTION = '[role="option"]';

/** The toast text for linking a task to this goal: "Added to X." or "Moved to X.". */
const linkMessage = (task: Task, goal: Goal) =>
  task.goal ? `Moved to ${goal.title}.` : `Added to ${goal.title}.`;

/**
 * "Add tasks": a popover with a search box and the open tasks. Choosing one links it to the goal
 * and keeps the popover open; clicking a linked one takes it out again (Enter in the box only links).
 * Escape, Tab or a click outside closes it.
 */
export function AddTasksPopover({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const tasks = useOpenTasks();
  const { setTaskGoal } = useGoalActions();

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

  const all = tasks.data ?? [];
  const needle = query.trim().toLowerCase();
  const shown = needle ? all.filter((task) => task.title.toLowerCase().includes(needle)) : all;

  const choose = (task: Task) => {
    if (task.goal?.id === goal.id) {
      setTaskGoal.mutate({
        taskId: task.id,
        goalId: null,
        message: `Removed from ${goal.title}.`,
      });
    } else {
      setTaskGoal.mutate({ taskId: task.id, goalId: goal.id, message: linkMessage(task, goal) });
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      // Tab closes the popover and lands on the trigger (the key press itself is swallowed)
      event.preventDefault();
      setOpen(false);
      setQuery('');
      button.current?.focus();
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
      // Enter in the box links the first match
      const first = shown[0];
      if (first) {
        event.preventDefault();
        if (first.goal?.id !== goal.id) choose(first);
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
        Add tasks
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="Add tasks to this goal"
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
            aria-multiselectable="true"
            className="flex max-h-64 flex-col overflow-y-auto"
          >
            {shown.map((task) => {
              const linked = task.goal?.id === goal.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  role="option"
                  aria-selected={linked}
                  tabIndex={-1}
                  onClick={() => {
                    choose(task);
                  }}
                  className="flex min-h-7 items-center gap-2 rounded-chip px-2 py-1 text-left text-body text-fg focus-ring hover:bg-input focus-visible:bg-input"
                >
                  <span
                    className={cx(
                      'flex size-4 shrink-0 items-center justify-center rounded-chip',
                      linked && 'bg-module-tasks text-on-tile',
                    )}
                  >
                    {linked ? <IconCheck size={12} stroke={2} aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {task.goal && !linked ? (
                    <span className="max-w-[110px] shrink-0 truncate text-small text-fg-muted">
                      {`In: ${task.goal.title}`}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {tasks.isPending ? (
            <p role="status" className="px-2 py-1.5 text-small text-fg-secondary">
              Loading tasks…
            </p>
          ) : null}
          {tasks.isError ? (
            <div role="alert" className="flex items-center gap-2 px-2 py-1.5">
              <p className="min-w-0 flex-1 text-small text-fg-secondary">
                {tasks.error instanceof ApiError
                  ? tasks.error.message
                  : 'Could not load your tasks.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  void tasks.refetch();
                }}
                className="shrink-0 rounded-chip px-2 py-1 text-small font-medium text-fg focus-ring hover:bg-input"
              >
                Try again
              </button>
            </div>
          ) : null}
          {!tasks.isPending && !tasks.isError && shown.length === 0 ? (
            <p className="px-2 py-1.5 text-small text-fg-muted">
              {all.length === 0
                ? 'No open tasks. Type above to add one to this goal.'
                : 'No matching tasks.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
