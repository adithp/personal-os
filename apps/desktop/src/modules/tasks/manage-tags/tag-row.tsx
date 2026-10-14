import { TAG_NAME_MAX, tagName, type Tag } from '@personal-os/shared';
import { Button, Input, cx } from '@personal-os/ui';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../api/api-client';
import { useTagActions } from '../tags-queries';
import { ColorPopover } from './color-popover';
import { GHOST_BUTTON } from './ghost-button';
import { deleteQuestion, mergeQuestion, usageLabel } from './tag-wording';

type Mode =
  | { kind: 'idle' }
  | { kind: 'rename'; error: string | null }
  | { kind: 'merge'; target: Tag }
  | { kind: 'delete' };

export interface TagRowProps {
  tag: Tag;
  /** Every tag, to find a name that is taken. */
  all: readonly Tag[];
  /** The one row whose buttons are reached with Tab. */
  active: boolean;
  onActivate: () => void;
  /** Called just before a delete or merge removes this row, so the dialog can pick the next focus. */
  onGone: () => void;
}

/** One tag: color dot, name, usage, and the rename, merge and delete flows. */
export function TagRow({ tag, all, active, onActivate, onGone }: TagRowProps) {
  const { update, remove, merge } = useTagActions();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [draft, setDraft] = useState(tag.name);
  const [picking, setPicking] = useState<HTMLElement | null>(null);
  const row = useRef<HTMLLIElement>(null);
  const dot = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);

  const taskCount = tag.taskCount ?? 0;
  const favoriteCount = tag.favoriteCount ?? 0;
  const tabIndex = active ? 0 : -1;

  // Back to the plain row: keep the keyboard on this row
  useEffect(() => {
    if (mode.kind === 'idle' && wasBusy.current) row.current?.focus();
    wasBusy.current = mode.kind !== 'idle';
  }, [mode.kind]);

  useEffect(() => {
    if (mode.kind === 'delete' || mode.kind === 'merge') cancelButton.current?.focus();
  }, [mode.kind]);

  const startRename = () => {
    setDraft(tag.name);
    setMode({ kind: 'rename', error: null });
  };

  const startDelete = () => {
    if (taskCount === 0 && favoriteCount === 0) {
      onGone();
      remove.mutate(tag.id);
    } else {
      setMode({ kind: 'delete' });
    }
  };

  const saveRename = async () => {
    const parsed = tagName.safeParse(draft);
    if (!parsed.success) {
      setMode({
        kind: 'rename',
        error: parsed.error.issues[0]?.message ?? 'That name does not work.',
      });
      return;
    }
    const name = parsed.data;
    if (name === tag.name) {
      setMode({ kind: 'idle' });
      return;
    }
    const taken = all.find(
      (other) => other.id !== tag.id && other.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      setMode({ kind: 'merge', target: taken });
      return;
    }
    try {
      await update.mutateAsync({ id: tag.id, name });
      setMode({ kind: 'idle' });
    } catch (caught) {
      // The hook shows the toast; a name clash also shows under the box
      if (caught instanceof ApiError && caught.status === 409) {
        setMode({ kind: 'rename', error: caught.message });
      }
    }
  };

  const onRowKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startRename();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      startDelete();
    }
  };

  /** Escape inside a question or the rename box cancels it and stays in the dialog. */
  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setMode({ kind: 'idle' });
    }
  };

  const question = (text: string, confirm: string, danger: boolean, onConfirm: () => void) => (
    <div
      role="group"
      aria-label={`${tag.name} question`}
      onKeyDown={cancelOnEscape}
      className="flex flex-1 flex-col gap-2 py-1"
    >
      <p className="text-body text-fg">{text}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className={cx('h-7 px-3', danger && 'text-danger')}
          onClick={onConfirm}
        >
          {confirm}
        </Button>
        <Button
          ref={cancelButton}
          variant="secondary"
          className="h-7 px-3"
          onClick={() => {
            setMode({ kind: 'idle' });
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <li
      ref={row}
      data-tag-row={tag.id}
      tabIndex={tabIndex}
      onFocus={onActivate}
      onKeyDown={onRowKeyDown}
      className={cx(
        'group flex min-h-9 items-start gap-2 rounded-control px-2 focus-ring outline-none',
        'hover:bg-input focus-visible:bg-input',
      )}
    >
      <button
        ref={dot}
        type="button"
        aria-label={`Color of ${tag.name}`}
        aria-haspopup="menu"
        aria-expanded={picking !== null}
        tabIndex={tabIndex}
        onClick={(event) => {
          const button = event.currentTarget;
          setPicking((value) => (value ? null : button));
        }}
        className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full focus-ring"
      >
        <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: tag.color }} />
      </button>
      {picking ? (
        <ColorPopover
          anchor={picking}
          name={tag.name}
          current={tag.color}
          onPick={(color) => {
            if (color.toLowerCase() !== tag.color.toLowerCase()) {
              update.mutate({ id: tag.id, color });
            }
            setPicking(null);
            dot.current?.focus();
          }}
          onClose={() => {
            setPicking(null);
            dot.current?.focus();
          }}
        />
      ) : null}

      {mode.kind === 'rename' ? (
        <div className="flex flex-1 flex-col gap-1 py-1">
          <Input
            autoFocus
            aria-label={`Rename ${tag.name}`}
            value={draft}
            maxLength={TAG_NAME_MAX}
            aria-invalid={mode.error !== null}
            aria-describedby={mode.error ? `tag-error-${tag.id}` : undefined}
            className="h-7"
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            onChange={(event) => {
              setDraft(event.target.value);
              if (mode.error) setMode({ kind: 'rename', error: null });
            }}
            onKeyDown={(event) => {
              cancelOnEscape(event);
              if (event.key === 'Enter') {
                event.preventDefault();
                void saveRename();
              }
            }}
          />
          {mode.error ? (
            <p id={`tag-error-${tag.id}`} role="alert" className="text-small text-danger">
              {mode.error}
            </p>
          ) : null}
        </div>
      ) : mode.kind === 'merge' ? (
        question(
          mergeQuestion(mode.target.name, tag.name, taskCount, favoriteCount),
          'Merge',
          false,
          () => {
            onGone();
            merge.mutate({ sourceId: tag.id, targetId: mode.target.id });
            setMode({ kind: 'idle' });
          },
        )
      ) : mode.kind === 'delete' ? (
        question(deleteQuestion(tag.name, taskCount, favoriteCount), 'Delete tag', true, () => {
          onGone();
          remove.mutate(tag.id);
          setMode({ kind: 'idle' });
        })
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate py-[7px] text-body text-fg">{tag.name}</span>
          <span className="shrink-0 py-[7px] text-small text-fg-muted">
            {usageLabel(taskCount, tag.noteCount ?? 0)}
          </span>
          <span className="flex shrink-0 items-center gap-1 py-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Rename ${tag.name}`}
              tabIndex={tabIndex}
              onClick={startRename}
              className={GHOST_BUTTON}
            >
              <IconPencil size={14} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Delete ${tag.name}`}
              tabIndex={tabIndex}
              onClick={startDelete}
              className={GHOST_BUTTON}
            >
              <IconTrash size={14} aria-hidden />
            </button>
          </span>
        </>
      )}
    </li>
  );
}
