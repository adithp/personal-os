import type { CreateTaskInput, Task } from '@personal-os/shared';
import { Button, GlassCard } from '@personal-os/ui';
import { IconInbox } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { useToasts } from '../../../store/toast-store';
import { useNow } from '../../dashboard/greeting';
import { TaskDetailPanel } from '../detail/task-detail-panel';
import { InboxShortcutsHelp } from './inbox-shortcuts-help';
import { TaskRow, type TaskItemContext } from '../my-tasks/task-item';
import { useTaskShortcuts } from '../my-tasks/use-task-shortcuts';
import { QuickAddBar } from '../quick-add/bar/quick-add-bar';
import { useTagActions } from '../tags-queries';
import { useTaskActions } from '../tasks-queries';
import { useTasksUi } from '../tasks-ui-store';
import { QuickActions, type QuickActionHandlers } from './quick-actions';
import { useInbox } from './use-inbox';
import { useInboxShortcuts } from './use-inbox-shortcuts';

const itemKeyOf = (task: Task) => `inbox/${task.id}`;

/** Inbox: tasks with no date and no tag, sorted one by one with quick actions on each row. */
export function InboxPage() {
  const now = useNow();
  const navigate = useNavigate();
  const ui = useTasksUi();
  const { select } = ui;
  const inbox = useInbox();
  const { complete, update, remove, move, setTags, archive } = useTaskActions();
  const tagActions = useTagActions();

  const [helpOpen, setHelpOpen] = useState(false);
  const [tabKey, setTabKey] = useState<string | null>(null);
  const addBox = useRef<HTMLInputElement>(null);
  const listRoot = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<{ index: number; count: number; at: number } | null>(null);

  const byId = useMemo(() => new Map(inbox.tasks.map((task) => [task.id, task])), [inbox.tasks]);
  const keys = inbox.tasks.map(itemKeyOf);
  const tabbableKey = tabKey !== null && keys.includes(tabKey) ? tabKey : (keys[0] ?? null);

  // After a task leaves the list, focus the row that took its place (the previous one if it was last)
  const keepPlace = (task: Task) => {
    const rows = [...(listRoot.current?.querySelectorAll<HTMLElement>('[data-item-key]') ?? [])];
    const index = rows.findIndex((el) => el.dataset.taskId === task.id);
    if (index >= 0 && rows[index]?.contains(document.activeElement)) {
      pendingFocus.current = { index, count: rows.length, at: Date.now() };
    }
  };
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (Date.now() - pending.at > 2000) {
      pendingFocus.current = null;
      return;
    }
    const rows = listRoot.current?.querySelectorAll<HTMLElement>('[data-item-key]');
    if (!rows || rows.length >= pending.count) return;
    pendingFocus.current = null;
    if (document.activeElement === document.body || document.activeElement === null) {
      rows[Math.min(pending.index, rows.length - 1)]?.focus();
    }
  });

  const toggle = (task: Task) => {
    keepPlace(task);
    complete.mutate(task.id);
  };
  const erase = (task: Task) => {
    keepPlace(task);
    if (ui.selectedTaskId === task.id) select(null);
    remove.mutate(task.id);
  };

  const handlers: QuickActionHandlers = {
    onDate: (task, dueAt) => {
      keepPlace(task);
      move.mutate({ input: { id: task.id, dueAt, dueAllDay: true } });
    },
    onTag: (task, tagId) => {
      keepPlace(task);
      setTags.mutate({ id: task.id, tagIds: [tagId] });
    },
    onNewTag: async (task, name) => {
      keepPlace(task);
      const { item } = await tagActions.create.mutateAsync({ name });
      setTags.mutate({ id: task.id, tagIds: [item.id] });
    },
    onPriority: (task, priority) => {
      update.mutate({ id: task.id, priority });
    },
    onArchive: (task) => {
      keepPlace(task);
      archive.mutate(task.id);
    },
    onDelete: erase,
  };

  useTaskShortcuts({
    rootRef: listRoot,
    grid: false,
    getTask: (id) => byId.get(id),
    focusAdd: () => addBox.current?.focus(),
    onToggle: toggle,
    onOpen: (task) => {
      select(task.id);
    },
    onDelete: erase,
    onEscape: () => {
      if (ui.selectedTaskId !== null) select(null);
    },
    onHelp: () => {
      setHelpOpen(true);
    },
  });
  useInboxShortcuts({ getTask: (id) => byId.get(id), onPriority: handlers.onPriority });

  const context: TaskItemContext = {
    now,
    selectedId: ui.selectedTaskId,
    tabbableKey,
    onFocusItem: setTabKey,
    onSelect: (task) => {
      select(task.id);
    },
    onToggle: toggle,
    onDelete: erase,
  };

  // A task typed with a date or a tag does not belong in the Inbox: say where it went
  const onAdded = (input: CreateTaskInput) => {
    if (input.dueAt !== undefined || (input.tagNames?.length ?? 0) > 0) {
      useToasts.getState().show('Added to My tasks.');
    }
  };

  const hasTasks = inbox.count > 0;
  const ready = !inbox.isPending && !inbox.isError;

  return (
    <div className="flex h-full min-h-0 w-full gap-6 px-8 pt-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-page font-semibold text-fg">Inbox</h1>
            <p className="text-small text-fg-muted">
              {inbox.isPending || inbox.isError || !hasTasks
                ? ' '
                : `${String(inbox.count)} to sort`}
            </p>
            {ready && hasTasks ? (
              <p className="pt-1 text-small text-fg-muted">
                Give each task a date or a tag to file it.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => {
              setHelpOpen(true);
            }}
            className="h-[30px] rounded-control px-2 text-body text-fg-muted focus-ring hover:bg-input hover:text-fg"
          >
            ?
          </button>
        </header>

        <QuickAddBar autoFocus inputRef={addBox} onAdded={onAdded} />

        {inbox.isError ? (
          <GlassCard role="alert" className="flex items-center justify-between gap-4">
            <p className="text-body text-fg">
              {inbox.error instanceof ApiError ? inbox.error.message : 'Could not load your tasks.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void inbox.refetch();
              }}
            >
              Try again
            </Button>
          </GlassCard>
        ) : null}

        {inbox.isPending && !inbox.isError ? (
          <p role="status" className="px-1 text-body text-fg-muted">
            Loading tasks…
          </p>
        ) : null}

        {ready && !hasTasks ? (
          <GlassCard className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-input text-fg-muted">
              <IconInbox size={20} stroke={1.5} aria-hidden />
            </span>
            <h2 className="text-section font-medium text-fg">Your inbox is empty</h2>
            <p className="text-body text-fg-muted">
              Every task has a date or a tag. New tasks without either show up here.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void navigate({ to: '/tasks/my-tasks' });
              }}
            >
              Open My tasks
            </Button>
          </GlassCard>
        ) : null}

        {ready && hasTasks ? (
          <GlassCard padding="none" className="p-1.5">
            <ul ref={listRoot} aria-label="Inbox tasks" className="flex flex-col">
              {inbox.tasks.map((task) => {
                const itemKey = itemKeyOf(task);
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    itemKey={itemKey}
                    context={context}
                    hideDelete
                    actions={
                      <QuickActions
                        task={task}
                        handlers={handlers}
                        selected={ui.selectedTaskId === task.id}
                        tabbable={tabbableKey === itemKey}
                      />
                    }
                  />
                );
              })}
            </ul>
          </GlassCard>
        ) : null}
      </div>

      {ui.selectedTaskId !== null ? (
        <TaskDetailPanel
          taskId={ui.selectedTaskId}
          onClose={() => {
            const closing = ui.selectedTaskId;
            const inPanel = document.activeElement?.closest('[role="complementary"]') !== null;
            select(null);
            // Keyboard users land back on the task they were editing (if it is still there)
            if (closing !== null && inPanel) {
              setTimeout(() => {
                listRoot.current
                  ?.querySelector<HTMLElement>(`[data-task-id="${closing}"]`)
                  ?.focus();
              }, 0);
            }
          }}
        />
      ) : null}
      {helpOpen ? (
        <InboxShortcutsHelp
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
