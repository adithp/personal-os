import type { Goal } from '@personal-os/shared';
import { GOAL_TITLE_MAX } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import {
  IconCalendar,
  IconChevronLeft,
  IconCircleCheck,
  IconCircleX,
  IconDots,
  IconTarget,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useToasts } from '../../../../store/toast-store';
import { DateTimeBox } from '../../detail/date-fields';
import { Popover, PopoverItem } from '../../detail/popover';
import { useDraft } from '../../detail/use-draft';
import { shortDate } from './goal-dates';

export interface GoalHeaderProps {
  goal: Goal;
  now: Date;
  /** `onFail` drops the typed text when the save failed. */
  onTitle: (title: string, onFail: () => void) => void;
  onTargetAt: (targetAt: string | null) => void;
  onAchieve: () => void;
  onDrop: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onHelp: () => void;
}

/** The title: a borderless box saved on blur or Enter. An empty title is refused and the old one returns. */
function GoalTitle({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string, onFail: () => void) => void;
}) {
  const draft = useDraft(title);
  // Text typed but not handed to onSave yet; saved when the page closes while still editing
  const unsaved = useRef<string | null>(null);
  const latest = useRef({ title, onSave });
  useEffect(() => {
    latest.current = { title, onSave };
  });
  useEffect(
    () => () => {
      const next = unsaved.current?.trim();
      if (next && next !== latest.current.title) latest.current.onSave(next, () => undefined);
    },
    [],
  );
  const commit = () => {
    if (!draft.editing) return;
    unsaved.current = null;
    const next = draft.value.trim();
    if (next === '') {
      draft.discard();
      useToasts.getState().show('Add a title', { tone: 'error' });
    } else if (next === title) draft.discard();
    else onSave(next, draft.discard); // the draft stays until the saved title arrives, so the old one never flashes back
  };
  return (
    <input
      type="text"
      aria-label="Goal title"
      value={draft.value}
      maxLength={GOAL_TITLE_MAX}
      spellCheck={false}
      onChange={(event) => {
        unsaved.current = event.target.value;
        draft.set(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        else if (event.key === 'Escape' && draft.editing) {
          event.preventDefault();
          event.stopPropagation();
          unsaved.current = null;
          draft.discard();
        }
      }}
      className="-ml-1 min-w-0 flex-1 truncate rounded-chip bg-transparent px-1 text-page font-semibold text-fg focus-ring transition-colors duration-150 ease-out hover:bg-input motion-reduce:transition-none"
    />
  );
}

/** "By 31 Dec" with a button that opens a date box; Clear removes the date. */
function TargetDate({
  targetAt,
  now,
  onChange,
}: {
  targetAt: string | null;
  now: Date;
  onChange: (targetAt: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Set when the box closes by Enter or Escape; a click elsewhere keeps the focus where it went
  const returnFocus = useRef(false);
  useEffect(() => {
    if (editing) {
      box.current?.querySelector('input')?.focus();
      return undefined;
    }
    if (!returnFocus.current) return undefined;
    returnFocus.current = false;
    // After the key press is over, so the Enter that closed the box cannot also click the button
    const timer = setTimeout(() => {
      trigger.current?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [editing]);

  const quiet =
    'inline-flex h-6 items-center gap-1 rounded-chip px-1.5 text-small text-fg-secondary focus-ring transition-colors duration-150 ease-out hover:bg-input motion-reduce:transition-none';

  if (editing) {
    return (
      <div
        ref={box}
        className="w-[150px]"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          // Focus going nowhere (Enter, or a click on empty space) comes back to the button
          if (event.relatedTarget === null) returnFocus.current = true;
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            returnFocus.current = true;
            setEditing(false);
          }
        }}
      >
        <DateTimeBox
          label="Target date"
          kind="date"
          value={targetAt}
          onCommit={(iso) => {
            onChange(iso);
            returnFocus.current = true;
            setEditing(false);
          }}
        />
      </div>
    );
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={quiet}
        onClick={() => {
          setEditing(true);
        }}
      >
        <IconCalendar size={13} stroke={1.5} aria-hidden />
        {targetAt ? `By ${shortDate(targetAt, now)}` : 'Set a target date'}
      </button>
      {targetAt ? (
        <button
          type="button"
          aria-label="Clear target date"
          className={cx(quiet, 'w-6 justify-center px-0')}
          onClick={() => {
            onChange(null);
          }}
        >
          <IconX size={12} stroke={1.5} aria-hidden />
        </button>
      ) : null}
    </>
  );
}

const ITEM = 'gap-2';

/** Back link, the title row with its status chip and menu, and the target date. */
export function GoalHeader({
  goal,
  now,
  onTitle,
  onTargetAt,
  onAchieve,
  onDrop,
  onReopen,
  onDelete,
  onHelp,
}: GoalHeaderProps) {
  const closed = goal.status !== 'active';
  return (
    <header className="flex flex-col gap-1.5">
      <Link
        to="/tasks/goals"
        className="inline-flex w-fit items-center gap-1 rounded-chip text-small text-fg-muted focus-ring hover:text-fg"
      >
        <IconChevronLeft size={13} stroke={1.5} aria-hidden />
        Goals
      </Link>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-[26px] shrink-0 items-center justify-center rounded-chip bg-module-tasks text-on-tile"
        >
          <IconTarget size={15} stroke={1.5} />
        </span>
        <GoalTitle title={goal.title} onSave={onTitle} />
        {closed ? (
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-chip bg-input px-2 text-small text-fg-secondary">
            {goal.status === 'achieved' ? (
              <IconCircleCheck size={12} stroke={1.5} aria-hidden />
            ) : (
              <IconCircleX size={12} stroke={1.5} aria-hidden />
            )}
            {goal.status === 'achieved' ? 'Achieved' : 'Dropped'}
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          onClick={onHelp}
          className="h-[30px] min-h-6 min-w-6 shrink-0 rounded-control px-2 text-body text-fg-muted focus-ring hover:bg-input hover:text-fg"
        >
          ?
        </button>
        <Popover
          label="More"
          popupLabel="Goal actions"
          align="end"
          triggerClassName="inline-flex size-[30px] items-center justify-center rounded-control glass text-fg transition-colors duration-150 ease-out hover:bg-input motion-reduce:transition-none"
          trigger={<IconDots size={16} stroke={1.5} aria-hidden />}
        >
          {(close) => (
            <>
              {goal.status === 'active' ? (
                <>
                  <PopoverItem
                    role="menuitem"
                    className={ITEM}
                    onSelect={() => {
                      close();
                      onAchieve();
                    }}
                  >
                    <IconCircleCheck size={14} stroke={1.5} aria-hidden />
                    Mark as achieved
                  </PopoverItem>
                  <PopoverItem
                    role="menuitem"
                    className={ITEM}
                    onSelect={() => {
                      close();
                      onDrop();
                    }}
                  >
                    <IconCircleX size={14} stroke={1.5} aria-hidden />
                    Drop goal
                  </PopoverItem>
                </>
              ) : (
                <PopoverItem
                  role="menuitem"
                  className={ITEM}
                  onSelect={() => {
                    close();
                    onReopen();
                  }}
                >
                  <IconTarget size={14} stroke={1.5} aria-hidden />
                  Make active again
                </PopoverItem>
              )}
              <PopoverItem
                role="menuitem"
                className={cx(ITEM, 'text-danger')}
                onSelect={() => {
                  close();
                  onDelete();
                }}
              >
                <IconTrash size={14} stroke={1.5} aria-hidden />
                Delete goal
              </PopoverItem>
            </>
          )}
        </Popover>
      </div>
      <div className="ml-[30px] flex items-center gap-1 text-small text-fg-secondary">
        <TargetDate targetAt={goal.targetAt} now={now} onChange={onTargetAt} />
      </div>
    </header>
  );
}
