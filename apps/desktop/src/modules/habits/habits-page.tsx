import type { Habit, HabitDay } from '@personal-os/shared';
import { Button, GlassCard, SegmentedControl, cx } from '@personal-os/ui';
import { IconChevronDown, IconChevronRight, IconFlame, IconPlus } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { ApiError } from '../../api/api-client';
import { categoriesOf, daysText, scheduleLabel, splitToday } from './format';
import { HabitDetailPanel } from './habit-detail-panel';
import { HabitDialog } from './habit-dialog';
import { createInputOf, patchOf, type HabitFields } from './habit-form';
import { HabitRow } from './habit-row';
import { useHabitActions, useHabits } from './habits-queries';
import { HabitsHelp } from './habits-help';
import { useHabitShortcuts } from './use-habit-shortcuts';

const VIEWS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const;

type View = (typeof VIEWS)[number]['value'];
type DialogState = { mode: 'create' } | { mode: 'edit'; id: string } | null;

function ArchivedList({
  habits,
  onRestore,
}: {
  habits: readonly Habit[];
  onRestore: (habit: Habit) => void;
}) {
  return (
    <ul aria-label="Archived habits" className="flex flex-col gap-2">
      {habits.map((habit) => (
        <li key={habit.id}>
          <div className="flex items-center gap-3 rounded-card glass p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-fg">{habit.name}</p>
              <p className="truncate text-small text-fg-muted">
                {[
                  habit.category,
                  scheduleLabel(habit.schedule),
                  `Best streak ${daysText(habit.bestStreak)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Button
              variant="secondary"
              aria-label={`Restore: ${habit.name}`}
              onClick={() => {
                onRestore(habit);
              }}
            >
              Restore
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The Habits page: today's check-ins, the habits not due today, and a detail panel on the right. */
export function HabitsPage() {
  const [view, setView] = useState<View>('active');
  const archivedView = view === 'archived';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [notTodayOpen, setNotTodayOpen] = useState(false);
  const [tabKey, setTabKey] = useState<string | null>(null);
  const listRoot = useRef<HTMLDivElement>(null);

  const query = useHabits(archivedView);
  const { create, update, archive, restore, log, unlog } = useHabitActions();

  const all = useMemo(() => query.data ?? [], [query.data]);
  const categories = useMemo(() => categoriesOf(all), [all]);
  const activeCategory = category !== null && categories.includes(category) ? category : null;
  const shown = activeCategory ? all.filter((habit) => habit.category === activeCategory) : all;
  const { today, notToday } = useMemo(() => splitToday(shown), [shown]);
  const visible = notTodayOpen ? [...today, ...notToday] : today;
  const keys = visible.map((habit) => habit.id);
  const tabbableKey = tabKey !== null && keys.includes(tabKey) ? tabKey : (keys[0] ?? null);

  const byId = (id: string) => all.find((habit) => habit.id === id);
  const selected = !archivedView && selectedId !== null ? byId(selectedId) : undefined;
  const editing = dialog?.mode === 'edit' ? byId(dialog.id) : undefined;
  const doneToday = today.filter((habit) => habit.today.done).length;

  /** Click or Space: check, uncheck, or for a counter add one (a done counter is reset). */
  const toggle = (habit: Habit) => {
    if (habit.today.done) unlog.mutate({ id: habit.id });
    else if (habit.target > 1) {
      log.mutate({ id: habit.id, count: habit.today.count + 1, quiet: true });
    } else log.mutate({ id: habit.id });
  };
  const step = (habit: Habit, delta: 1 | -1) => {
    const count = habit.today.count + delta;
    if (count <= 0) unlog.mutate({ id: habit.id, quiet: true });
    else log.mutate({ id: habit.id, count, quiet: true });
  };
  const toggleDay = (habit: Habit, day: HabitDay) => {
    if (day.done) unlog.mutate({ id: habit.id, date: day.date });
    else log.mutate({ id: habit.id, date: day.date });
  };

  const openCreate = () => {
    setDialog({ mode: 'create' });
  };

  useHabitShortcuts({
    rootRef: listRoot,
    onNew: openCreate,
    onToggle: (id) => {
      const habit = byId(id);
      if (habit?.today.scheduled && !archivedView) toggle(habit);
    },
    onOpen: (id) => {
      if (!archivedView) setSelectedId(id);
    },
    onEdit: (id) => {
      if (!archivedView) setDialog({ mode: 'edit', id });
    },
    onEscape: () => {
      setSelectedId(null);
    },
    onHelp: () => {
      setHelpOpen(true);
    },
  });

  const save = async (fields: HabitFields) => {
    if (dialog?.mode === 'edit' && editing) {
      const patch = patchOf(editing, fields);
      if (Object.keys(patch).length > 0) await update.mutateAsync({ id: editing.id, ...patch });
    } else {
      await create.mutateAsync(createInputOf(fields));
    }
    setDialog(null);
  };

  const neverHadHabit = query.isSuccess && all.length === 0;
  const newHabitButton = (
    <Button onClick={openCreate}>
      <IconPlus size={16} stroke={1.5} aria-hidden />
      New habit
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 w-full gap-4 px-8 pt-4 pb-4">
      <div ref={listRoot} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-page font-semibold text-fg">Habits</h1>
            <p className="min-h-[15px] text-small text-fg-muted">
              {query.isSuccess && !archivedView && today.length > 0
                ? `${String(doneToday)} of ${String(today.length)} done today`
                : ' '}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              label="Habit list"
              value={view}
              options={VIEWS}
              onChange={(next) => {
                setView(next);
                setSelectedId(null);
                setCategory(null);
              }}
            />
            {newHabitButton}
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              onClick={() => {
                setHelpOpen(true);
              }}
              className="h-[30px] min-h-6 min-w-6 rounded-control px-2 text-body text-fg-muted focus-ring hover:bg-input hover:text-fg"
            >
              ?
            </button>
          </div>
        </header>

        {query.isError ? (
          <GlassCard role="alert" className="flex items-center justify-between gap-4">
            <p className="text-body text-fg">
              {query.error instanceof ApiError
                ? query.error.message
                : 'Could not load your habits.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void query.refetch();
              }}
            >
              Try again
            </Button>
          </GlassCard>
        ) : null}

        {query.isPending ? (
          <p role="status" className="px-1 text-body text-fg-muted">
            Loading habits…
          </p>
        ) : null}

        {neverHadHabit && !archivedView ? (
          <GlassCard className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-input text-fg-muted">
              <IconFlame size={20} stroke={1.5} aria-hidden />
            </span>
            <h2 className="text-section font-medium text-fg">No habits yet</h2>
            <p className="text-body text-fg-muted">
              A habit is something you want to do again and again. Check it off each day to build a
              streak.
            </p>
            {newHabitButton}
          </GlassCard>
        ) : null}

        {neverHadHabit && archivedView ? (
          <p role="status" className="px-1 text-body text-fg-muted">
            No archived habits
          </p>
        ) : null}

        {query.isSuccess && archivedView && shown.length > 0 ? (
          <ArchivedList
            habits={shown}
            onRestore={(habit) => {
              restore.mutate(habit.id);
            }}
          />
        ) : null}

        {query.isSuccess && !archivedView && all.length > 0 ? (
          <>
            {categories.length > 0 ? (
              <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
                {[null, ...categories].map((name) => {
                  const on = activeCategory === name;
                  return (
                    <button
                      key={name ?? 'all'}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setCategory(name);
                      }}
                      className={cx(
                        'h-7 rounded-chip px-3 text-body focus-ring transition-colors duration-150 ease-out',
                        on
                          ? 'bg-accent font-medium text-on-tile'
                          : 'bg-input text-fg-secondary hover:text-fg',
                      )}
                    >
                      {name ?? 'All'}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <section aria-label="Today" className="flex flex-col gap-2">
              <h2 className="px-1 text-card font-medium text-fg-secondary">Today</h2>
              {today.length === 0 ? (
                <p role="status" className="px-1 text-body text-fg-muted">
                  Nothing is due today
                </p>
              ) : (
                <>
                  {doneToday === today.length ? (
                    <p role="status" className="px-1 text-body text-fg-muted">
                      All done for today
                    </p>
                  ) : null}
                  <ul aria-label="Today's habits" className="flex flex-col gap-2">
                    {today.map((habit) => (
                      <HabitRow
                        key={habit.id}
                        habit={habit}
                        selected={selected?.id === habit.id}
                        tabbable={tabbableKey === habit.id}
                        onFocusRow={setTabKey}
                        onOpen={(target) => {
                          setSelectedId(target.id);
                        }}
                        onToggle={toggle}
                        onStep={step}
                      />
                    ))}
                  </ul>
                </>
              )}
            </section>

            {notToday.length > 0 ? (
              <section aria-label="Not today" className="flex flex-col gap-2">
                <button
                  type="button"
                  aria-expanded={notTodayOpen}
                  onClick={() => {
                    setNotTodayOpen((open) => !open);
                  }}
                  className="flex items-center gap-1 self-start rounded-chip px-1 text-card font-medium text-fg-muted focus-ring hover:text-fg"
                >
                  {notTodayOpen ? (
                    <IconChevronDown size={14} aria-hidden />
                  ) : (
                    <IconChevronRight size={14} aria-hidden />
                  )}
                  Not today ({notToday.length})
                </button>
                {notTodayOpen ? (
                  <ul aria-label="Habits not due today" className="flex flex-col gap-2">
                    {notToday.map((habit) => (
                      <HabitRow
                        key={habit.id}
                        habit={habit}
                        muted
                        selected={selected?.id === habit.id}
                        tabbable={tabbableKey === habit.id}
                        onFocusRow={setTabKey}
                        onOpen={(target) => {
                          setSelectedId(target.id);
                        }}
                        onToggle={toggle}
                        onStep={step}
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      {selected ? (
        <HabitDetailPanel
          habit={selected}
          onClose={() => {
            setSelectedId(null);
          }}
          onEdit={(habit) => {
            setDialog({ mode: 'edit', id: habit.id });
          }}
          onToggleDay={toggleDay}
        />
      ) : null}

      {dialog && (dialog.mode === 'create' || editing) ? (
        <HabitDialog
          habit={editing}
          categories={categories}
          onSave={save}
          onArchive={
            editing
              ? () => {
                  archive.mutate(editing.id);
                  setDialog(null);
                  setSelectedId(null);
                }
              : undefined
          }
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {helpOpen ? (
        <HabitsHelp
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
