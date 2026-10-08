import type { Task } from '@personal-os/shared';
import { Button, GlassCard, SegmentedControl } from '@personal-os/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { useNow } from '../../dashboard/greeting';
import { BoardView } from '../board/board-view';
import { TaskDetailPanel } from '../detail/task-detail-panel';
import { NOT_MANUAL_MESSAGE } from '../drag/resolve-drop';
import { TASK_FEATURES } from '../features';
import {
  applyFilters,
  filtersFromSearch,
  groupTasks,
  hasActiveFilters,
  searchFromFilters,
  sortTasks,
  type TaskFilters,
  type TaskSearch,
} from '../filters';
import { QuickAddBar } from '../quick-add/bar/quick-add-bar';
import { summarize, type SectionId } from '../sections';
import { useTags } from '../tags-queries';
import { useTaskActions } from '../tasks-queries';
import { useTasksUi, type ViewMode } from '../tasks-ui-store';
import { FilterMenu, GroupMenu, SortMenu } from './controls';
import { ShortcutsHelp } from './shortcuts-help';
import type { TaskItemContext } from './task-item';
import { TaskSection } from './task-section';
import { TasksDnd } from './tasks-dnd';
import { useMyTasksData } from './use-my-tasks-data';
import { useTaskShortcuts } from './use-task-shortcuts';

const BOARD_READY: boolean = TASK_FEATURES.board;

const VIEW_OPTIONS = [
  { value: 'cards', label: 'Cards' },
  { value: 'list', label: 'List' },
] as const;

/** My tasks: header, Filter / Sort / Group, quick add, and the tasks as cards or rows. */
export function MyTasksPage() {
  const now = useNow();
  const search: TaskSearch = useSearch({ from: '/_app/tasks/my-tasks' });
  const navigate = useNavigate({ from: '/tasks/my-tasks' });
  const ui = useTasksUi();
  const { complete, update, remove } = useTaskActions();

  const filters = useMemo(() => filtersFromSearch(search), [search]);
  const archived = filters.archived === true;
  const data = useMyTasksData(archived);
  const tags = useTags();

  const view: ViewMode = ui.view === 'board' && !BOARD_READY ? 'cards' : ui.view;

  const [helpOpen, setHelpOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [tabKey, setTabKey] = useState<string | null>(null);
  const addBox = useRef<HTMLInputElement>(null);
  const listRoot = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ index: number; count: number; at: number } | null>(null);

  // A link can carry sort, group, and the open task; they apply when the page opens or changes
  const { setSort, setGroup, select } = ui;
  useEffect(() => {
    if (search.sort) setSort(search.sort);
  }, [search.sort, setSort]);
  useEffect(() => {
    if (search.group) setGroup(search.group);
  }, [search.group, setGroup]);
  useEffect(() => {
    if (search.task) select(search.task);
  }, [search.task, select]);

  const changeFilters = (next: TaskFilters) => {
    void navigate({
      search: (previous: TaskSearch) => ({
        ...searchFromFilters(next),
        ...(previous.group ? { group: previous.group } : {}),
        ...(previous.sort ? { sort: previous.sort } : {}),
        ...(previous.task ? { task: previous.task } : {}),
      }),
      replace: true,
    });
  };

  const tagNames = useMemo(
    () => new Map((tags.data ?? []).map((tag) => [tag.id, tag.name])),
    [tags.data],
  );
  const shown = useMemo(
    () => sortTasks(applyFilters(data.tasks, filters, now), ui.sort),
    [data.tasks, filters, now, ui.sort],
  );
  const groups = useMemo(
    () =>
      groupTasks(shown, ui.group, now, tagNames).filter(
        (g) => ui.group === 'due' || g.tasks.length > 0,
      ),
    [shown, ui.group, now, tagNames],
  );
  const byId = useMemo(() => new Map(data.tasks.map((task) => [task.id, task])), [data.tasks]);

  const isCollapsed = (id: string) =>
    ui.group === 'due'
      ? ui.collapsedSections[id as SectionId] === true
      : collapsedGroups[id] === true;
  const toggleGroup = (id: string) => {
    if (ui.group === 'due') ui.toggleSection(id as SectionId);
    else setCollapsedGroups((current) => ({ ...current, [id]: !current[id] }));
  };

  const visibleKeys = groups.flatMap((group) =>
    view !== 'board' && !isCollapsed(group.id) ? group.tasks.map((t) => `${group.id}/${t.id}`) : [],
  );
  const tabbableKey =
    tabKey !== null && visibleKeys.includes(tabKey) ? tabKey : (visibleKeys[0] ?? null);

  // After a task leaves the screen (done, deleted), focus its neighbour so the keyboard keeps its place
  const keepPlace = (task: Task) => {
    const items = [...(listRoot.current?.querySelectorAll('[data-item-key]') ?? [])];
    const index = items.findIndex(
      (el) => el instanceof HTMLElement && el.dataset.taskId === task.id,
    );
    if (index >= 0 && items[index] === document.activeElement) {
      pendingFocus.current = { index, count: items.length, at: Date.now() };
    }
  };
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (Date.now() - pending.at > 2000) {
      pendingFocus.current = null;
      return;
    }
    const items = listRoot.current?.querySelectorAll<HTMLElement>('[data-item-key]');
    if (!items || items.length >= pending.count) return;
    pendingFocus.current = null;
    if (document.activeElement === document.body || document.activeElement === null) {
      items[Math.min(pending.index, items.length - 1)]?.focus();
    }
  });

  const toggle = (task: Task) => {
    keepPlace(task);
    if (task.status === 'done') update.mutate({ id: task.id, status: 'todo' });
    else complete.mutate(task.id);
  };
  const erase = (task: Task) => {
    keepPlace(task);
    if (ui.selectedTaskId === task.id) select(null);
    remove.mutate(task.id);
  };

  useTaskShortcuts({
    rootRef: listRoot,
    grid: view === 'cards',
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

  const summary = archived
    ? `${String(shown.length)} archived`
    : (() => {
        const { open, overdue } = summarize(data.openTasks, now);
        if (open === 0) return 'Nothing left to do';
        return `${String(open)} open${overdue > 0 ? ` · ${String(overdue)} overdue` : ''}`;
      })();

  const filtered = hasActiveFilters(filters);
  const empty = shown.length === 0;

  // Archived tasks cannot be dragged. Reordering needs Manual sort (moving between sections does not).
  const dragEnabled = !archived && view !== 'board';
  const manualSort = ui.sort === 'manual';
  const sections =
    view === 'board'
      ? null
      : groups.map((group) => (
          <TaskSection
            key={group.id}
            group={group}
            view={view}
            heading={ui.group !== 'none'}
            collapsed={isCollapsed(group.id)}
            onToggle={() => {
              toggleGroup(group.id);
            }}
            context={context}
            dnd={dragEnabled ? { sections: ui.group === 'due' } : undefined}
            footer={
              ui.group === 'due' && group.id === 'completed' && data.canShowMore ? (
                <div>
                  <Button variant="secondary" disabled={data.loadingMore} onClick={data.showMore}>
                    Show more
                  </Button>
                </div>
              ) : null
            }
          />
        ));

  return (
    <div className="flex h-full min-h-0 w-full gap-6 px-8 pt-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-page font-semibold text-fg">My tasks</h1>
            <p className="text-small text-fg-muted">{data.isPending ? ' ' : summary}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <SegmentedControl
              label="View"
              value={view === 'board' ? 'board' : view}
              options={
                BOARD_READY ? [...VIEW_OPTIONS, { value: 'board', label: 'Board' }] : VIEW_OPTIONS
              }
              onChange={ui.setView}
            />
            {BOARD_READY ? null : (
              <button
                type="button"
                disabled
                aria-label="Board, coming soon"
                className="inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-body text-fg-muted opacity-60"
              >
                <span aria-hidden>Board</span>
                <span aria-hidden className="text-small">
                  Soon
                </span>
              </button>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-1">
          <FilterMenu filters={filters} tags={tags.data ?? []} onChange={changeFilters} />
          <SortMenu value={ui.sort} onChange={ui.setSort} />
          <GroupMenu value={ui.group} onChange={ui.setGroup} />
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                changeFilters({});
              }}
              className="h-[30px] rounded-control px-3 text-body text-fg-secondary focus-ring hover:bg-input hover:text-fg"
            >
              Clear filters
            </button>
          ) : null}
          {!archived && !manualSort ? (
            <p className="px-2 text-small text-fg-muted">{NOT_MANUAL_MESSAGE}</p>
          ) : null}
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => {
              setHelpOpen(true);
            }}
            className="ml-auto h-[30px] rounded-control px-2 text-body text-fg-muted focus-ring hover:bg-input hover:text-fg"
          >
            ?
          </button>
        </div>

        <QuickAddBar autoFocus inputRef={addBox} />

        {data.isError ? (
          <GlassCard role="alert" className="flex items-center justify-between gap-4">
            <p className="text-body text-fg">
              {data.error instanceof ApiError ? data.error.message : 'Could not load your tasks.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void data.refetch();
              }}
            >
              Try again
            </Button>
          </GlassCard>
        ) : null}

        {data.isPending && !data.isError ? (
          <p role="status" className="px-1 text-body text-fg-muted">
            Loading tasks…
          </p>
        ) : null}

        {!data.isPending && !data.isError && empty ? (
          <div className="flex flex-col items-start gap-2 px-1">
            <p className="text-body text-fg-muted">
              {archived
                ? 'No archived tasks.'
                : filtered
                  ? 'No tasks match these filters.'
                  : 'No tasks yet. Type above and press Enter to add your first one.'}
            </p>
          </div>
        ) : null}

        <div ref={listRoot} className="flex flex-col gap-5">
          {!data.isPending && !data.isError && !empty && view === 'board' ? (
            <BoardView tasks={shown} now={now} manualSort={ui.sort === 'manual'} />
          ) : null}
          {!data.isPending && !data.isError && !empty && view !== 'board' ? (
            dragEnabled ? (
              <TasksDnd
                groups={groups}
                groupKey={ui.group}
                view={view}
                now={now}
                manualSort={manualSort}
                context={context}
              >
                {sections}
              </TasksDnd>
            ) : (
              sections
            )
          ) : null}
        </div>
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
        <ShortcutsHelp
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
