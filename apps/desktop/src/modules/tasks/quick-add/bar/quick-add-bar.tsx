import { IconArrowRight, IconPlus } from '@tabler/icons-react';
import {
  useEffect,
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
  const [announced, setAnnounced] = useState('');
  const box = useRef<HTMLInputElement | null>(null);
  // The latest text, readable from the async error callback without a state updater
  const latestTitle = useRef('');
  const announceNow = useRef(false);

  useImperativeHandle(inputRef, () => box.current as unknown as HTMLInputElement, []);

  const parsed = useMemo(() => parseQuickAdd(title, now, ignored), [title, now, ignored]);
  const empty = title.trim() === '';
  const noTitle = !empty && parsed.title === '';

  const summary =
    parsed.parts.length > 0
      ? `Understood: ${parsed.parts.map((part) => part.label).join(', ')}`
      : '';
  // Screen readers hear the summary 500 ms after typing stops, or at once after an ignore
  useEffect(() => {
    const delay = announceNow.current ? 0 : 500;
    announceNow.current = false;
    const timer = setTimeout(() => {
      setAnnounced(summary);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [summary]);

  const changeTitle = (next: string) => {
    latestTitle.current = next;
    setTitle(next);
    // Forget ignored parts whose words are gone, so typing them again shows the chip again
    setIgnored((current) => {
      if (current.size === 0) return current;
      const present = new Set(parseQuickAdd(next, new Date()).parts.map(partKey));
      const kept = [...current].filter((key) => present.has(key));
      return kept.length === current.size ? current : new Set(kept);
    });
  };

  const ignore = (part: QuickAddPart) => {
    announceNow.current = true;
    setIgnored((current) => new Set(current).add(partKey(part)));
    box.current?.focus();
  };

  const add = (event: SyntheticEvent) => {
    event.preventDefault();
    if (empty || noTitle) return;
    const typed = title;
    const keptIgnored = ignored;
    // Parse again with the real clock: the shared one can be a minute old (typed 23:59, sent after midnight)
    const fresh = parseQuickAdd(title, new Date(), ignored);
    const input: CreateTaskInput = { title: fresh.title };
    if (fresh.dueAt !== null) {
      input.dueAt = fresh.dueAt;
      input.dueAllDay = fresh.dueAllDay;
    }
    if (fresh.priority !== null) input.priority = fresh.priority;
    if (fresh.tagNames.length > 0) input.tagNames = fresh.tagNames;
    if (fresh.recurrenceRule !== null) input.recurrenceRule = fresh.recurrenceRule;
    latestTitle.current = '';
    setTitle('');
    setIgnored(new Set());
    box.current?.focus();
    create.mutate(input, {
      onError: () => {
        // Give the text back only if the user has not typed something new meanwhile
        if (latestTitle.current !== '') return;
        latestTitle.current = typed;
        setTitle(typed);
        setIgnored(keptIgnored);
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
            changeTitle(event.target.value);
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
      <div className="flex min-h-5 flex-col gap-1.5">
        <UnderstoodChips parts={parsed.parts} onIgnore={ignore} />
        <p id="quick-add-no-title" role="status" className="px-2 text-small text-fg-secondary">
          {noTitle ? 'Add a title' : ''}
        </p>
        {focused && empty ? (
          <p className="px-2 text-small text-fg-secondary">Try: Pay rent every month #home !high</p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announced}
      </p>
    </div>
  );
}
