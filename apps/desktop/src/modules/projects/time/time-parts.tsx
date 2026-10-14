import {
  formatDuration,
  MAX_TIME_ENTRY_SECONDS,
  TIME_NOTE_MAX,
  type Task,
  type TimeEntry,
} from '@personal-os/shared';
import { Button, GlassCard, IconButton, Input } from '@personal-os/ui';
import { IconPencil, IconPlayerPlay, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { DateTimeBox } from '../../tasks/detail/date-fields';
import { ConfirmDialog, Dialog, Field, Select } from '../components';
import { formatClock, formatDayShort, formatTimer } from '../format';
import { useTicker } from '../use-ticker';
import { useProjectTasks, useRunningTimer, useTimeActions } from '../projects-queries';

/** Seconds a running entry has run, ticking every second. */
function useElapsed(entry: TimeEntry | null | undefined): number {
  const now = useTicker(Boolean(entry));
  return entry ? Math.max(0, Math.floor((now - Date.parse(entry.startedAt)) / 1000)) : 0;
}

/** The running timer: project, task, ticking time and Stop. Renders nothing when no timer runs. */
export function RunningTimer({ compact = false }: { compact?: boolean }) {
  const running = useRunningTimer();
  const { stop } = useTimeActions();
  const entry = running.data ?? null;
  const elapsed = useElapsed(entry);
  if (!entry) return null;
  return (
    <div
      role="timer"
      aria-label="Running timer"
      className="flex items-center gap-3 rounded-control bg-input px-3 py-1.5"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-module-projects" />
      <span className="min-w-0 truncate text-body text-fg">
        {compact
          ? entry.projectTitle
          : `${entry.projectTitle}${entry.taskTitle ? ` / ${entry.taskTitle}` : ''}`}
      </span>
      <span className="font-medium text-fg tabular-nums">{formatTimer(elapsed)}</span>
      <Button
        variant="secondary"
        disabled={stop.isPending}
        onClick={() => {
          stop.mutate(entry.id);
        }}
      >
        <IconPlayerStop size={16} stroke={1.5} aria-hidden />
        Stop
      </Button>
    </div>
  );
}

/**
 * Start a timer on a project (and optionally one of its tasks). If a timer already runs, it shows
 * above (RunningTimer); starting here stops that one first (the server does it).
 */
export function StartTimer({ projectId }: { projectId: string }) {
  const tasks = useProjectTasks(projectId);
  const running = useRunningTimer();
  const { start } = useTimeActions();
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');
  const here = running.data?.projectId === projectId;
  const elsewhere = running.data && !here;
  const open = (tasks.data ?? []).filter((task) => task.status !== 'done' && !task.archivedAt);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[180px] flex-1">
        <Field label="Task (optional)" htmlFor={`timer-task-${projectId}`}>
          <Select
            id={`timer-task-${projectId}`}
            value={taskId}
            onChange={(event) => {
              setTaskId(event.target.value);
            }}
          >
            <option value="">No task</option>
            {open.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="min-w-[180px] flex-1">
        <Field label="Note (optional)" htmlFor={`timer-note-${projectId}`}>
          <Input
            id={`timer-note-${projectId}`}
            value={note}
            maxLength={TIME_NOTE_MAX}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
      </div>
      <Button
        disabled={start.isPending || here}
        onClick={() => {
          start.mutate(
            {
              projectId,
              ...(taskId ? { taskId } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            },
            {
              onSuccess: () => {
                setNote('');
              },
            },
          );
        }}
      >
        <IconPlayerPlay size={16} stroke={1.5} aria-hidden />
        {elsewhere ? 'Switch timer here' : 'Start timer'}
      </Button>
    </div>
  );
}

const rangeOf = (entry: TimeEntry): string =>
  entry.endedAt
    ? `${formatDayShort(entry.startedAt)}, ${formatClock(entry.startedAt)} to ${formatClock(entry.endedAt)}`
    : `${formatDayShort(entry.startedAt)}, ${formatClock(entry.startedAt)} (running)`;

/** Add or edit a finished time entry by hand. */
export function EntryDialog({
  projectId,
  entry,
  tasks,
  onClose,
}: {
  projectId: string;
  entry?: TimeEntry;
  tasks: readonly Task[];
  onClose: () => void;
}) {
  const { add, update } = useTimeActions();
  const [endedAt, setEndedAt] = useState<string | null>(
    () => entry?.endedAt ?? new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(),
  );
  const [startedAt, setStartedAt] = useState<string | null>(
    () =>
      entry?.startedAt ??
      new Date(Math.floor(Date.now() / 60000) * 60000 - 3600 * 1000).toISOString(),
  );
  const [taskId, setTaskId] = useState(entry?.taskId ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!startedAt || !endedAt) {
      setError('Set the start and the end');
      return;
    }
    const seconds = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
    if (seconds <= 0) {
      setError('The end must be after the start');
      return;
    }
    if (seconds > MAX_TIME_ENTRY_SECONDS) {
      setError('An entry can be at most 24 hours');
      return;
    }
    setBusy(true);
    try {
      if (entry) {
        await update.mutateAsync({
          id: entry.id,
          startedAt,
          endedAt,
          taskId: taskId || null,
          note: note.trim() === '' ? null : note.trim(),
        });
      } else {
        await add.mutateAsync({
          projectId,
          startedAt,
          endedAt,
          ...(taskId ? { taskId } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      }
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog title={entry ? 'Edit time entry' : 'Add time'} onClose={onClose} dirty>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <DateTimeBox
            label="Start"
            kind="datetime"
            value={startedAt}
            onCommit={(iso) => {
              setStartedAt(iso);
              setError(null);
            }}
          />
        </Field>
        <Field label="End">
          <DateTimeBox
            label="End"
            kind="datetime"
            value={endedAt}
            onCommit={(iso) => {
              setEndedAt(iso);
              setError(null);
            }}
          />
        </Field>
      </div>
      <Field label="Task (optional)" htmlFor="entry-task">
        <Select
          id="entry-task"
          value={taskId}
          onChange={(event) => {
            setTaskId(event.target.value);
          }}
        >
          <option value="">No task</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note (optional)" htmlFor="entry-note">
        <Input
          id="entry-note"
          value={note}
          maxLength={TIME_NOTE_MAX}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      <p role="alert" className="min-h-[15px] text-small text-danger">
        {error}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void submit();
          }}
        >
          {entry ? 'Save' : 'Add time'}
        </Button>
      </div>
    </Dialog>
  );
}

/** A list of time entries; edit and delete when `onEdit` is given. */
export function EntryList({
  entries,
  showProject,
  onEdit,
}: {
  entries: readonly TimeEntry[];
  showProject: boolean;
  onEdit?: (entry: TimeEntry) => void;
}) {
  const { remove } = useTimeActions();
  const [confirming, setConfirming] = useState<TimeEntry | null>(null);
  return (
    <>
      <ul aria-label="Time entries" className="flex flex-col">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="group flex min-h-9 items-center gap-3 rounded-chip px-2 py-1 hover:bg-input"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body text-fg">
                {showProject
                  ? `${entry.projectTitle}${entry.taskTitle ? ` / ${entry.taskTitle}` : ''}`
                  : (entry.taskTitle ?? entry.note ?? 'Time')}
              </span>
              <span className="truncate text-small text-fg-muted">
                {rangeOf(entry)}
                {entry.note && (showProject || entry.taskTitle) ? ` · ${entry.note}` : ''}
              </span>
            </div>
            <span className="text-body font-medium text-fg tabular-nums">
              {formatDuration(entry.seconds)}
            </span>
            {onEdit && entry.endedAt ? (
              <span className="flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                <IconButton
                  aria-label={`Edit entry ${rangeOf(entry)}`}
                  icon={<IconPencil size={14} aria-hidden />}
                  onClick={() => {
                    onEdit(entry);
                  }}
                />
                <IconButton
                  aria-label={`Delete entry ${rangeOf(entry)}`}
                  icon={<IconTrash size={14} aria-hidden />}
                  onClick={() => {
                    setConfirming(entry);
                  }}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {confirming ? (
        <ConfirmDialog
          title="Delete time entry?"
          message={`${formatDuration(confirming.seconds)} on ${formatDayShort(confirming.startedAt)} will be removed. You can undo it for a few seconds.`}
          confirmLabel="Delete"
          onCancel={() => {
            setConfirming(null);
          }}
          onConfirm={() => {
            remove.mutate(confirming.id);
            setConfirming(null);
          }}
        />
      ) : null}
    </>
  );
}

/** A glass card with a heading, used by the time screens. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassCard className="flex flex-col gap-3">
      <h2 className="text-section font-medium text-fg">{title}</h2>
      {children}
    </GlassCard>
  );
}
