import type { Task } from '@personal-os/shared';
import { cx, moduleColorVar } from '@personal-os/ui';
import { IconCheck } from '@tabler/icons-react';

export interface TaskCheckboxProps {
  task: Pick<Task, 'title' | 'status'>;
  onToggle: () => void;
  className?: string;
}

/** The round checkbox: yellow check when done. Tab to it, then Space to complete or reopen. */
export function TaskCheckbox({ task, onToggle, className }: TaskCheckboxProps) {
  const done = task.status === 'done';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? 'Reopen' : 'Complete'}: ${task.title}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cx(
        'flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] focus-ring transition-colors duration-150 ease-out',
        done ? 'border-transparent text-on-tile' : 'border-fg-muted hover:border-fg',
        className,
      )}
      style={done ? { backgroundColor: moduleColorVar('tasks') } : undefined}
    >
      {done ? <IconCheck size={12} stroke={2.5} aria-hidden /> : null}
    </button>
  );
}
