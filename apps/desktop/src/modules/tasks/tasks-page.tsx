import type { Task } from '@personal-os/shared';
import { Button, GlassCard, Input } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { ApiError } from '../../api/api-client';
import { useNow } from '../dashboard/greeting';
import { TaskDetail } from './task-detail';
import { TaskRow } from './task-row';
import { useTaskActions, useTasks } from './tasks-queries';

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h2 className="px-3 text-small font-medium text-fg-muted">
        {title} <span aria-hidden>· {count}</span>
      </h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/** The Tasks screen: add a task, tick it off, and open one to edit its details. */
export function TasksPage() {
  const now = useNow();
  const tasks = useTasks();
  const { create, update, complete, remove } = useTaskActions();
  const [title, setTitle] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = tasks.data ?? [];
  const open = items.filter((task) => task.status !== 'done');
  const done = items.filter((task) => task.status === 'done');
  const selected = items.find((task) => task.id === selectedId) ?? null;

  const add = (event: SyntheticEvent) => {
    event.preventDefault();
    const text = title.trim();
    if (text === '') return;
    setTitle('');
    create.mutate({ title: text });
  };

  const toggle = (task: Task) => {
    if (task.status === 'done') update.mutate({ id: task.id, status: 'todo' });
    else complete.mutate(task.id);
  };

  const erase = (task: Task) => {
    if (selectedId === task.id) setSelectedId(null);
    remove.mutate(task.id);
  };

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      now={now}
      selected={task.id === selectedId}
      onSelect={(id) => {
        setSelectedId(id === selectedId ? null : id);
      }}
      onToggle={toggle}
      onDelete={erase}
    />
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] gap-6 px-8 pt-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <div>
          <h1 className="text-page font-semibold text-fg">Tasks</h1>
          <p className="text-small text-fg-muted">
            {tasks.isSuccess
              ? open.length === 0
                ? 'Nothing left to do'
                : `${String(open.length)} to do`
              : ' '}
          </p>
        </div>

        <form onSubmit={add} className="relative">
          <Input
            aria-label="New task"
            placeholder="Add a task"
            autoComplete="off"
            autoFocus
            value={title}
            className="h-10 pl-9"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
          <IconPlus
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
        </form>

        {tasks.isError ? (
          <GlassCard role="alert" className="flex items-center justify-between gap-4">
            <p className="text-body text-fg">
              {tasks.error instanceof ApiError ? tasks.error.message : 'Could not load your tasks.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void tasks.refetch();
              }}
            >
              Try again
            </Button>
          </GlassCard>
        ) : null}

        {tasks.isPending ? <p className="px-3 text-body text-fg-muted">Loading tasks…</p> : null}

        {tasks.isSuccess && items.length === 0 ? (
          <p className="px-3 text-body text-fg-muted">
            No tasks yet. Type above and press Enter to add your first one.
          </p>
        ) : null}

        {open.length > 0 ? (
          <Section title="To do" count={open.length}>
            {open.map(row)}
          </Section>
        ) : null}
        {done.length > 0 ? (
          <Section title="Done" count={done.length}>
            {done.map(row)}
          </Section>
        ) : null}
      </div>

      {selected ? (
        <TaskDetail
          key={selected.id}
          task={selected}
          onChange={(patch) => {
            update.mutate({ id: selected.id, ...patch });
          }}
          onDelete={() => {
            erase(selected);
          }}
          onClose={() => {
            setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}
