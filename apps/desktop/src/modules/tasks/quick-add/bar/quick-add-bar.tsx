import { Input } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useState, type Ref, type SyntheticEvent } from 'react';
import { useTaskActions } from '../../tasks-queries';

export interface QuickAddBarProps {
  /** Focus the box when the page opens (the dashboard "New task" button relies on this). */
  autoFocus?: boolean;
  /** Lets the page focus the box (the N shortcut). */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * A title-only bar for now (Feature 4 upgrades it to understand dates, tags, and priority).
 * Pressing Enter creates a task with useTaskActions().create, clears the box, and keeps focus.
 * If the server refuses, the hook shows its message and the text comes back.
 */
export function QuickAddBar({ autoFocus = false, inputRef }: QuickAddBarProps) {
  const { create } = useTaskActions();
  const [title, setTitle] = useState('');

  const add = (event: SyntheticEvent) => {
    event.preventDefault();
    const text = title.trim();
    if (text === '') return;
    setTitle('');
    create.mutate(
      { title: text },
      {
        onError: () => {
          setTitle((current) => (current === '' ? text : current));
        },
      },
    );
  };

  return (
    <form onSubmit={add} className="relative">
      <Input
        ref={inputRef}
        aria-label="New task"
        placeholder="Add a task"
        autoComplete="off"
        autoFocus={autoFocus}
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
  );
}
