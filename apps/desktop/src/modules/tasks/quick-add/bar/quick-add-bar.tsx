import { IconArrowRight, IconPlus } from '@tabler/icons-react';
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

  const empty = title.trim() === '';

  return (
    <form
      onSubmit={add}
      // A glass command bar: soft border, a thin inner highlight, and a quiet accent edge on focus
      className="flex h-10 items-center gap-2.5 rounded-[16px] glass pr-1.5 pl-2 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors duration-150 ease-out focus-within:border-accent"
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-input text-fg-secondary"
      >
        <IconPlus size={14} stroke={2} />
      </span>
      <input
        ref={inputRef}
        type="text"
        aria-label="New task"
        placeholder="Add a task…"
        autoComplete="off"
        autoFocus={autoFocus}
        value={title}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
      <button
        type="submit"
        aria-label="Add task"
        disabled={empty}
        className="flex size-7 shrink-0 items-center justify-center rounded-[9px] border-[0.5px] text-on-tile focus-ring transition-[filter,opacity,box-shadow] duration-150 ease-out enabled:hover:brightness-110 enabled:active:brightness-95 disabled:cursor-default disabled:opacity-45"
        style={{
          backgroundImage:
            'linear-gradient(145deg, color-mix(in srgb, var(--accent) 100%, white 22%), var(--accent) 55%, color-mix(in srgb, var(--accent) 78%, black 22%))',
          borderColor: 'color-mix(in srgb, var(--accent) 60%, white 40%)',
          boxShadow:
            '0 2px 10px color-mix(in srgb, var(--accent) 38%, transparent), inset 0 1px 0 color-mix(in srgb, white 45%, transparent)',
        }}
      >
        <IconArrowRight size={15} stroke={2.25} aria-hidden />
      </button>
    </form>
  );
}
