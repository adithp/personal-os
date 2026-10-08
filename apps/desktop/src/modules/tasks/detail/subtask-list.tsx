import { TASK_TITLE_MAX } from '@personal-os/shared';
import { IconButton, Input } from '@personal-os/ui';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { TaskCheckbox } from '../shared/task-checkbox';
import { useSubtasks, useTaskActions } from '../tasks-queries';

export interface SubtaskListProps {
  parentId: string;
}

/** The subtasks of a task (one level): check off, delete (with Undo), add, and a "2/3" line. */
export function SubtaskList({ parentId }: SubtaskListProps) {
  const { data: subtasks = [] } = useSubtasks(parentId);
  const { create, complete, update, remove } = useTaskActions();
  const [title, setTitle] = useState('');

  const done = subtasks.filter((subtask) => subtask.status === 'done').length;

  const add = () => {
    const next = title.trim();
    if (next === '') return;
    create.mutate({ title: next, parentTaskId: parentId });
    setTitle('');
  };

  return (
    <div className="flex flex-col gap-2">
      {subtasks.length > 0 ? (
        <p className="text-small text-fg-muted">{`${String(done)}/${String(subtasks.length)}`}</p>
      ) : null}
      {subtasks.length > 0 ? (
        <ul aria-label="Subtasks" className="flex flex-col">
          {subtasks.map((subtask) => (
            <li
              key={subtask.id}
              className="group flex min-h-8 items-center gap-2 rounded-[8px] px-1 hover:bg-input"
            >
              <TaskCheckbox
                task={subtask}
                onToggle={() => {
                  if (subtask.status === 'done') {
                    update.mutate({ id: subtask.id, status: 'todo' });
                  } else {
                    complete.mutate(subtask.id);
                  }
                }}
              />
              <span
                className={
                  subtask.status === 'done'
                    ? 'min-w-0 flex-1 truncate text-body text-fg-muted line-through'
                    : 'min-w-0 flex-1 truncate text-body text-fg'
                }
              >
                {subtask.title}
              </span>
              <IconButton
                aria-label={`Delete subtask: ${subtask.title}`}
                icon={<IconTrash size={14} aria-hidden />}
                className="opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => {
                  remove.mutate(subtask.id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        aria-label="Add a subtask"
        placeholder="Add a subtask"
        value={title}
        maxLength={TASK_TITLE_MAX}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}
