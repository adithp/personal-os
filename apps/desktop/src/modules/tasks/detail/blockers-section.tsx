import type { TaskBlocker } from '@personal-os/shared';
import { Button, Input } from '@personal-os/ui';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { useOpenTasks, useTaskActions } from '../tasks-queries';
import { Popover, PopoverItem } from './popover';

export interface BlockersSectionProps {
  taskId: string;
  /** The open tasks that block this one. */
  blockedBy: readonly TaskBlocker[];
}

/** The search box and the open tasks that can still be added as blockers. */
function BlockerPicker({
  taskId,
  blockedBy,
  onPick,
}: BlockersSectionProps & { onPick: (blockerId: string) => void }) {
  const { data: open = [], isPending, isError, error, refetch } = useOpenTasks();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const needle = query.trim().toLowerCase();
  const choices = open.filter(
    (task) =>
      task.id !== taskId &&
      task.parentTaskId === null &&
      !blockedBy.some((blocker) => blocker.id === task.id) &&
      task.title.toLowerCase().includes(needle),
  );
  const active = choices[Math.min(activeIndex, choices.length - 1)];
  const optionId = (id: string) => `${listId}-${id}`;

  useEffect(() => {
    if (active) document.getElementById(optionId(active.id))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const status = isError
    ? null
    : isPending
      ? 'Loading…'
      : choices.length > 0
        ? null
        : needle === ''
          ? 'You have no other open tasks.'
          : 'No tasks match your search.';

  return (
    <>
      <Input
        data-autofocus
        aria-label="Search tasks"
        placeholder="Search tasks"
        value={query}
        aria-activedescendant={active ? optionId(active.id) : undefined}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && active) {
            event.preventDefault();
            onPick(active.id);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (choices.length === 0) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const from = Math.min(activeIndex, choices.length - 1);
            setActiveIndex((from + step + choices.length) % choices.length);
          }
        }}
      />
      {isError ? (
        <div className="flex flex-col items-start gap-1 px-2 py-1">
          <p role="status" className="text-small text-danger">
            {error instanceof ApiError ? error.message : 'Could not load your tasks.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {status ? (
        <p role="status" className="px-2 py-1 text-small text-fg-muted">
          {status}
        </p>
      ) : null}
      <div className="flex max-h-48 flex-col overflow-y-auto">
        {choices.map((task) => (
          <PopoverItem
            key={task.id}
            id={optionId(task.id)}
            role="menuitem"
            className={task.id === active?.id ? 'bg-input' : undefined}
            onSelect={() => {
              onPick(task.id);
            }}
          >
            <span className="truncate">{task.title}</span>
          </PopoverItem>
        ))}
      </div>
    </>
  );
}

/** The Blocked by row: the open blockers as chips with a remove button, and Add blocker. */
export function BlockersSection({ taskId, blockedBy }: BlockersSectionProps) {
  const { addBlocker, removeBlocker } = useTaskActions();
  const root = useRef<HTMLDivElement>(null);
  // Where focus goes once the removed chip has left the list
  const afterRemove = useRef<{ removed: string; next: string | null } | null>(null);

  useEffect(() => {
    const pending = afterRemove.current;
    if (!pending || blockedBy.some((blocker) => blocker.id === pending.removed)) return;
    afterRemove.current = null;
    const target = pending.next
      ? root.current?.querySelector<HTMLElement>(`[data-remove-blocker="${pending.next}"]`)
      : root.current?.querySelector<HTMLElement>('button[aria-label="Add blocker"]');
    target?.focus();
  }, [blockedBy]);

  return (
    <div ref={root} className="flex flex-col gap-2">
      {blockedBy.length === 0 ? <p className="text-small text-fg-muted">Not blocked</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {blockedBy.map((blocker, index) => (
          <span
            key={blocker.id}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-[8px] bg-input pr-1 pl-2 text-small text-fg"
          >
            <span className="truncate">{blocker.title}</span>
            <button
              type="button"
              aria-label={`Remove blocker ${blocker.title}`}
              data-remove-blocker={blocker.id}
              onClick={() => {
                const neighbour = blockedBy[index + 1] ?? blockedBy[index - 1];
                afterRemove.current = { removed: blocker.id, next: neighbour?.id ?? null };
                removeBlocker.mutate({ id: taskId, blockerId: blocker.id });
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded-[6px] text-fg-muted focus-ring hover:text-fg"
            >
              <IconX size={12} aria-hidden />
            </button>
          </span>
        ))}
        <Popover
          label="Add blocker"
          popupLabel="Add blocker"
          triggerClassName="inline-flex h-5 items-center gap-1 px-2 text-small text-fg-secondary hover:text-fg"
          trigger={
            <>
              <IconPlus size={12} aria-hidden />
              <span aria-hidden>Add blocker</span>
            </>
          }
        >
          {(close) => (
            <BlockerPicker
              taskId={taskId}
              blockedBy={blockedBy}
              onPick={(blockerId) => {
                addBlocker.mutate({ id: taskId, blockerId });
                close();
              }}
            />
          )}
        </Popover>
      </div>
    </div>
  );
}
