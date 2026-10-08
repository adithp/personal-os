import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_TITLE_MAX,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@personal-os/shared';
import { Button, GlassCard, IconButton, Input, SegmentedControl } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { fromIstInput, toIstInput } from './dates';
import { priorityLabel } from './priority';
import type { TaskPatch } from './tasks-queries';

export interface TaskDetailProps {
  task: Task;
  onChange: (patch: TaskPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
] as const;

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: String(priority),
  label: priorityLabel(priority),
}));

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-small text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * A date and time box (India time) with a clear button. While you type, the box keeps a draft
 * (typing a year passes through 0002, 0020, 0202 on the way to 2026); the date is saved when you
 * leave the box or press Enter.
 */
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    // An empty or half-typed box is ignored; use the clear button to remove a date
    const iso = fromIstInput(draft);
    if (iso && iso !== value) onChange(iso);
  };

  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input
          type="datetime-local"
          aria-label={label}
          value={draft ?? toIstInput(value)}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {value ? (
          <IconButton
            aria-label={`Clear ${label.toLowerCase()}`}
            icon={<IconX size={14} aria-hidden />}
            onClick={() => {
              setDraft(null);
              onChange(null);
            }}
          />
        ) : null}
      </div>
    </Field>
  );
}

/**
 * The detail panel of the selected task. Text fields save when you leave them; choices and dates
 * save at once. The parent gives this component a new key per task, so the drafts start fresh.
 */
export function TaskDetail({ task, onChange, onDelete, onClose }: TaskDetailProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  const saveTitle = () => {
    const next = title.trim();
    if (next === '') {
      setTitle(task.title); // a task needs a title: put the old one back
      return;
    }
    if (next !== task.title) onChange({ title: next });
  };

  const saveDescription = () => {
    const next = description.trim();
    if (next !== (task.description ?? '')) onChange({ description: next === '' ? null : next });
  };

  return (
    <GlassCard
      role="complementary"
      aria-label="Task details"
      className="flex w-[340px] shrink-0 flex-col gap-4 self-start"
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label="Title"
          value={title}
          maxLength={TASK_TITLE_MAX}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <IconButton
          aria-label="Close details"
          icon={<IconX size={16} aria-hidden />}
          onClick={onClose}
        />
      </div>

      <Field label="Notes">
        <textarea
          aria-label="Description"
          rows={4}
          maxLength={TASK_DESCRIPTION_MAX}
          placeholder="Add details"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          onBlur={saveDescription}
          className="w-full resize-none rounded-control border-[0.5px] border-transparent bg-input px-3 py-2 text-body text-fg liquid-input focus-ring transition-colors duration-150 ease-out focus-visible:border-accent"
        />
      </Field>

      <Field label="Status">
        <SegmentedControl<TaskStatus>
          label="Status"
          value={task.status}
          options={STATUS_OPTIONS}
          onChange={(status) => {
            onChange({ status });
          }}
        />
      </Field>

      <Field label="Priority">
        <SegmentedControl
          label="Priority"
          value={String(task.priority)}
          options={PRIORITY_OPTIONS}
          onChange={(value) => {
            onChange({ priority: Number(value) as TaskPriority });
          }}
        />
      </Field>

      <DateField
        label="Due"
        value={task.dueAt}
        onChange={(dueAt) => {
          onChange({ dueAt });
        }}
      />
      <DateField
        label="Reminder"
        value={task.reminderAt}
        onChange={(reminderAt) => {
          onChange({ reminderAt });
        }}
      />

      <Button variant="secondary" className="self-start text-danger" onClick={onDelete}>
        Delete task
      </Button>
    </GlassCard>
  );
}
