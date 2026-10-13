import {
  TAG_NAME_MAX,
  TASK_PRIORITY_LABELS,
  createTagInput,
  type Task,
  type TaskPriority,
} from '@personal-os/shared';
import { cx, Input, Tooltip } from '@personal-os/ui';
import {
  IconCalendar,
  IconCalendarEvent,
  IconCheck,
  IconDots,
  IconPlus,
  IconTag,
} from '@tabler/icons-react';
import { useState } from 'react';
import { istDayStartPlus, startOfIstDay, toIstDate } from '../dates';
import { MenuSeparator } from '../my-tasks/menu';
import { checkPickedDate } from './pick-date';
import { useTags } from '../tags-queries';
import { nextMondayStart } from './next-monday';
import { QUICK_BUTTON, QuickItem, QuickMenu } from './quick-menu';

export interface QuickActionHandlers {
  /** Give the task this due day (the start of an India day, as UTC ISO). */
  onDate: (task: Task, dueAt: string) => void;
  onTag: (task: Task, tagId: string) => void;
  /** Create a tag with this name and give it to the task. Rejects when the tag could not be made. */
  onNewTag: (task: Task, name: string) => Promise<void>;
  onPriority: (task: Task, priority: TaskPriority) => void;
  onArchive: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const PRIORITIES: readonly TaskPriority[] = [1, 2, 3, 4];

function DateMenu({
  task,
  handlers,
  close,
}: {
  task: Task;
  handlers: QuickActionHandlers;
  close: () => void;
}) {
  const [today] = useState(() => toIstDate(startOfIstDay(Date.now())));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const choose = (dueAt: string) => {
    handlers.onDate(task, dueAt);
    close();
  };
  const submit = () => {
    const checked = checkPickedDate(draft, Date.now());
    if ('error' in checked) setError(checked.error);
    else choose(checked.dueAt);
  };
  return (
    <>
      <QuickItem
        onSelect={() => {
          choose(istDayStartPlus(Date.now(), 0));
        }}
      >
        Today
      </QuickItem>
      <QuickItem
        onSelect={() => {
          choose(istDayStartPlus(Date.now(), 1));
        }}
      >
        Tomorrow
      </QuickItem>
      <QuickItem
        onSelect={() => {
          choose(nextMondayStart(Date.now()));
        }}
      >
        Next week (Monday)
      </QuickItem>
      <MenuSeparator />
      <div className="flex flex-col gap-1 px-1 pt-0.5">
        <Input
          type="date"
          aria-label="Pick a date"
          min={today}
          value={draft}
          aria-invalid={error !== null}
          aria-describedby={error ? `date-error-${task.id}` : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        {error ? (
          <p id={`date-error-${task.id}`} role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <QuickItem onSelect={submit}>Set date</QuickItem>
    </>
  );
}

function TagMenu({
  task,
  handlers,
  close,
}: {
  task: Task;
  handlers: QuickActionHandlers;
  close: () => void;
}) {
  const { data: allTags = [] } = useTags();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = query.trim().replace(/^#+/, '').trim();
  const needle = name.toLowerCase();
  const shown = needle ? allTags.filter((tag) => tag.name.toLowerCase().includes(needle)) : allTags;
  const exact = allTags.find((tag) => tag.name.toLowerCase() === needle);

  const pick = (tagId: string) => {
    handlers.onTag(task, tagId);
    close();
  };
  const create = async () => {
    if (busy) return;
    const parsed = createTagInput.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That name does not work.');
      return;
    }
    setBusy(true);
    try {
      await handlers.onNewTag(task, parsed.data.name);
      close();
    } catch {
      // The hook already showed the server's message; the picker stays open to try again
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1 px-1 pt-0.5">
        <Input
          data-autofocus
          aria-label="Search tags"
          placeholder="Search or create a tag"
          value={query}
          maxLength={TAG_NAME_MAX}
          aria-invalid={error !== null}
          aria-describedby={error ? `tag-error-${task.id}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (exact) pick(exact.id);
              else if (name) void create();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              event.currentTarget
                .closest('[role="menu"]')
                ?.querySelector<HTMLElement>('[role="menuitem"]')
                ?.focus();
            }
          }}
        />
        {error ? (
          <p id={`tag-error-${task.id}`} role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {allTags.length === 0 && !name ? (
        <p className="px-2 py-1 text-small text-fg-muted">No tags yet. Type a name to make one.</p>
      ) : null}
      {shown.map((tag) => (
        <QuickItem
          key={tag.id}
          onSelect={() => {
            pick(tag.id);
          }}
        >
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          <span className="truncate">{tag.name}</span>
        </QuickItem>
      ))}
      {name && !exact ? (
        <QuickItem
          onSelect={() => {
            void create();
          }}
        >
          <IconPlus size={14} aria-hidden className="shrink-0" />
          <span className="truncate">{`Create #${name}`}</span>
        </QuickItem>
      ) : null}
    </>
  );
}

export interface QuickActionsProps {
  task: Task;
  handlers: QuickActionHandlers;
  /** The row is open in the detail panel: the buttons stay visible. */
  selected: boolean;
  /** The row is the Tab stop of the list: its buttons are reachable with Tab too. */
  tabbable: boolean;
}

/**
 * The quick actions of an Inbox row (docs/design/research/tasks-inbox.md D3): Today, Date, Tag, More.
 * They show on hover, on keyboard focus inside the row, and always on the selected row.
 */
export function QuickActions({ task, handlers, selected, tabbable }: QuickActionsProps) {
  const tabIndex = tabbable ? 0 : -1;
  return (
    <span
      data-quick-actions
      onClick={(event) => {
        event.stopPropagation();
      }}
      className={cx(
        'flex items-center gap-0.5 transition-opacity duration-150 ease-out motion-reduce:transition-none',
        selected
          ? 'opacity-100'
          : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
      )}
    >
      <Tooltip label="Today">
        <button
          type="button"
          data-quick="today"
          aria-label="Today"
          tabIndex={tabIndex}
          onClick={() => {
            handlers.onDate(task, istDayStartPlus(Date.now(), 0));
          }}
          className={QUICK_BUTTON}
        >
          <IconCalendarEvent size={16} stroke={1.5} aria-hidden />
        </button>
      </Tooltip>
      <QuickMenu
        label="Date…"
        popupLabel="Date"
        kind="date"
        tabIndex={tabIndex}
        icon={<IconCalendar size={16} stroke={1.5} aria-hidden />}
      >
        {(close) => <DateMenu task={task} handlers={handlers} close={close} />}
      </QuickMenu>
      <QuickMenu
        label="Tag…"
        popupLabel="Tags"
        kind="tag"
        tabIndex={tabIndex}
        icon={<IconTag size={16} stroke={1.5} aria-hidden />}
      >
        {(close) => <TagMenu task={task} handlers={handlers} close={close} />}
      </QuickMenu>
      <QuickMenu
        label="More"
        popupLabel="More actions"
        kind="more"
        tabIndex={tabIndex}
        icon={<IconDots size={16} stroke={1.5} aria-hidden />}
      >
        {(close) => (
          <>
            <p aria-hidden className="px-2 pt-1 text-small font-medium text-fg-muted">
              Priority
            </p>
            {PRIORITIES.map((priority) => (
              <QuickItem
                key={priority}
                role="menuitemradio"
                checked={task.priority === priority}
                onSelect={() => {
                  if (task.priority !== priority) handlers.onPriority(task, priority);
                  close();
                }}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {task.priority === priority ? <IconCheck size={14} aria-hidden /> : null}
                </span>
                {TASK_PRIORITY_LABELS[priority]}
              </QuickItem>
            ))}
            <MenuSeparator />
            <QuickItem
              onSelect={() => {
                handlers.onArchive(task);
                close();
              }}
            >
              Archive
            </QuickItem>
            <QuickItem
              onSelect={() => {
                handlers.onDelete(task);
                close();
              }}
            >
              Delete
            </QuickItem>
          </>
        )}
      </QuickMenu>
    </span>
  );
}
