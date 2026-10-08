import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@personal-os/shared';
import { Button, GlassCard, IconButton, SegmentedControl } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { ApiError } from '../../../api/api-client';
import { useTask, useTaskActions, type TaskPatch } from '../tasks-queries';
import { DueFields, ReminderField } from './date-fields';
import { SubtaskList } from './subtask-list';
import { TagSection } from './tag-section';
import { NotesField, TitleField } from './text-fields';

export interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
] as const;

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: String(priority),
  label: TASK_PRIORITY_LABELS[priority],
}));

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small font-medium text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

function Frame({
  onClose,
  children,
  showClose = true,
}: {
  onClose: () => void;
  children: ReactNode;
  showClose?: boolean;
}) {
  // Escape closes the panel, also from inside a text box. A menu that is open handles Escape
  // first and marks the key as used, so the panel stays.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <GlassCard
      role="complementary"
      aria-label="Task details"
      onKeyDown={onKeyDown}
      className="flex max-h-full min-h-0 w-[340px] shrink-0 flex-col gap-4 self-start overflow-y-auto"
    >
      {showClose ? (
        <div className="flex justify-end">
          <IconButton
            aria-label="Close details"
            icon={<IconX size={16} aria-hidden />}
            onClick={onClose}
          />
        </div>
      ) : null}
      {children}
    </GlassCard>
  );
}

function DetailBody({ task, onClose }: { task: Task; onClose: () => void }) {
  const { update, remove, archive, unarchive } = useTaskActions();
  const save = (patch: TaskPatch) => {
    update.mutate({ id: task.id, ...patch });
  };
  const isSubtask = task.parentTaskId !== null;

  return (
    <Frame onClose={onClose} showClose={false}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TitleField
            title={task.title}
            onSave={(title) => {
              save({ title });
            }}
          />
        </div>
        <IconButton
          aria-label="Close details"
          icon={<IconX size={16} aria-hidden />}
          onClick={onClose}
        />
      </div>

      <Row label="Status">
        <SegmentedControl<TaskStatus>
          label="Status"
          value={task.status}
          options={STATUS_OPTIONS}
          onChange={(status) => {
            if (status !== task.status) save({ status });
          }}
        />
      </Row>

      <Row label="Priority">
        <SegmentedControl
          label="Priority"
          value={String(task.priority)}
          options={PRIORITY_OPTIONS}
          className="flex-wrap"
          onChange={(value) => {
            const priority = Number(value) as TaskPriority;
            if (priority !== task.priority) save({ priority });
          }}
        />
      </Row>

      <Row label="Due">
        <DueFields
          dueAt={task.dueAt}
          dueAllDay={task.dueAllDay}
          onChange={(patch) => {
            save(patch);
          }}
        />
      </Row>

      <Row label="Reminder">
        <ReminderField
          reminderAt={task.reminderAt}
          onChange={(reminderAt) => {
            save({ reminderAt });
          }}
        />
      </Row>

      <Row label="Repeat">
        {task.recurrenceRule ? (
          <p className="text-body text-fg-secondary">{task.recurrenceRule}</p>
        ) : null}
        <p className="text-small text-fg-muted">Not available yet</p>
      </Row>

      <Row label="Blocked by">
        <p className="text-small text-fg-muted">Not available yet</p>
      </Row>

      <Row label="Tags">
        <TagSection
          tags={task.tags}
          onChange={(tagIds) => {
            save({ tagIds });
          }}
        />
      </Row>

      {isSubtask ? null : (
        <Row label="Subtasks">
          <SubtaskList parentId={task.id} />
        </Row>
      )}

      <Row label="Notes">
        <NotesField
          description={task.description}
          onSave={(description) => {
            save({ description });
          }}
        />
      </Row>

      <div className="flex gap-2">
        {task.archivedAt ? (
          <Button
            variant="secondary"
            onClick={() => {
              unarchive.mutate(task.id);
            }}
          >
            Unarchive
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              archive.mutate(task.id);
              onClose();
            }}
          >
            Archive
          </Button>
        )}
        <Button
          variant="secondary"
          className="text-danger"
          onClick={() => {
            remove.mutate(task.id);
            onClose();
          }}
        >
          Delete
        </Button>
      </div>
    </Frame>
  );
}

/**
 * The right-hand panel of the selected task. Text boxes save when you leave them (Enter for single
 * lines), choices save at once. The data comes from useTask, which the optimistic updates of
 * useTaskActions keep in step. Drafts restart when the task changes (the body is keyed by id).
 */
export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, error, isError, refetch } = useTask(taskId);
  const gone = isError && error instanceof ApiError && error.status === 404;

  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  if (task?.id === taskId) return <DetailBody key={task.id} task={task} onClose={onClose} />;

  if (isError && !gone) {
    return (
      <Frame onClose={onClose}>
        <p role="alert" className="text-body text-danger">
          {error instanceof ApiError ? error.message : 'Could not load this task.'}
        </p>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            void refetch();
          }}
        >
          Try again
        </Button>
      </Frame>
    );
  }

  return (
    <Frame onClose={onClose}>
      <p role="status" className="text-body text-fg-muted">
        Loading…
      </p>
    </Frame>
  );
}
