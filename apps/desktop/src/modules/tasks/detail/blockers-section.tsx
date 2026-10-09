import type { TaskBlocker } from '@personal-os/shared';
import { Input } from '@personal-os/ui';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';
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
  const { data: open = [], isPending } = useOpenTasks();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const choices = open.filter(
    (task) =>
      task.id !== taskId &&
      task.parentTaskId === null &&
      !blockedBy.some((blocker) => blocker.id === task.id) &&
      task.title.toLowerCase().includes(needle),
  );

  return (
    <>
      <Input
        data-autofocus
        aria-label="Search tasks"
        placeholder="Search tasks"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          const first = choices[0];
          if (event.key === 'Enter' && first) {
            event.preventDefault();
            onPick(first.id);
          } else if (event.key === 'ArrowDown') {
            // Hand over to the list; the popup's arrow keys take it from there
            event.preventDefault();
            event.currentTarget.parentElement
              ?.querySelector<HTMLElement>('[role="menuitem"]')
              ?.focus();
          }
        }}
      />
      {choices.length === 0 ? (
        <p className="px-2 py-1 text-small text-fg-muted">
          {isPending ? 'Loading…' : 'No matching tasks.'}
        </p>
      ) : null}
      <div className="flex max-h-48 flex-col overflow-y-auto">
        {choices.map((task) => (
          <PopoverItem
            key={task.id}
            role="menuitem"
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

  return (
    <div className="flex flex-col gap-2">
      {blockedBy.length === 0 ? <p className="text-small text-fg-muted">Not blocked</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {blockedBy.map((blocker) => (
          <span
            key={blocker.id}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-[8px] bg-input pr-1 pl-2 text-small text-fg"
          >
            <span className="truncate">{blocker.title}</span>
            <button
              type="button"
              aria-label={`Remove blocker ${blocker.title}`}
              onClick={() => {
                removeBlocker.mutate({ id: taskId, blockerId: blocker.id });
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-[6px] text-fg-muted focus-ring hover:text-fg"
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
