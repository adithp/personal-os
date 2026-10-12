import { IconArrowRight, IconPlus } from '@tabler/icons-react';
import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type SyntheticEvent,
} from 'react';
import type { CreateTaskInput } from '@personal-os/shared';
import { useNow } from '../../../dashboard/greeting';
import { useTaskActions } from '../../tasks-queries';
import { parseQuickAdd, partKey, type QuickAddPart } from '../parse';
import { UnderstoodChips } from './understood-chips';

export interface QuickAddBarProps {
  /** Focus the box when the page opens (the dashboard "New task" button relies on this). */
  autoFocus?: boolean;
  /** Lets the page focus the box (the N shortcut). */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Understands dates, tags, priority, and repeat in the typed text (parseQuickAdd) and shows what it
 * understood as chips under the bar. Enter creates the task with only the understood fields, clears
 * the box, and keeps focus. If the server refuses, the hook shows its message and the text comes back.
 */
export function QuickAddBar({ autoFocus = false, inputRef }: QuickAddBarProps) {
  const { create } = useTaskActions();
  const now = useNow();
  const [title, setTitle] = useState('');
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set());
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(inputRef, () => box.current ?? document.createElement('input'));

  const parsed = useMemo(() => parseQuickAdd(title, now, ignored), [title, now, ignored]);
  const empty = title.trim() === '';
  const noTitle = !empty && parsed.title === '';

  const ignore = (part: QuickAddPart) => {
    setIgnored((current) => new Set(current).add(partKey(part)));
    box.current?.focus();
  };

  const add = (event: SyntheticEvent) => {
    event.preventDefault();
    if (empty || noTitle) return;
    const typed = title;
    const keptIgnored = ignored;
    const input: CreateTaskInput = { title: parsed.title };
    if (parsed.dueAt !== null) {
      input.dueAt = parsed.dueAt;
      input.dueAllDay = parsed.dueAllDay;
    }
    if (parsed.priority !== null) input.priority = parsed.priority;
    if (parsed.tagNames.length > 0) input.tagNames = parsed.tagNames;
    if (parsed.recurrenceRule !== null) input.recurrenceRule = parsed.recurrenceRule;
    setTitle('');
    setIgnored(new Set());
    box.current?.focus();
    create.mutate(input, {
      onError: () => {
        setTitle((current) => {
          if (current !== '') return current;
          setIgnored(keptIgnored);
          return typed;
        });
      },
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
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
          ref={box}
          type="text"
          aria-label="New task"
          placeholder="Add a task…"
          autoComplete="off"
          autoFocus={autoFocus}
          value={title}
          aria-describedby={noTitle ? 'quick-add-no-title' : undefined}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <button
          type="submit"
          aria-label="Add task"
          disabled={empty || noTitle}
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
      <UnderstoodChips parts={parsed.parts} onIgnore={ignore} />
      {noTitle ? (
        <p id="quick-add-no-title" className="px-2 text-small text-fg-muted">
          Add a title
        </p>
      ) : null}
      {focused && empty ? (
        <p className="px-2 text-small text-fg-muted">Try: Pay rent every month #home !high</p>
      ) : null}
    </div>
  );
}
