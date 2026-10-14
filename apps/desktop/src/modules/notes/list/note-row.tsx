import type { NoteSummary } from '@personal-os/shared';
import { cx, moduleColorVar, Tooltip } from '@personal-os/ui';
import { IconArrowBackUp, IconDots, IconPin, IconTrashX } from '@tabler/icons-react';
import { noteDate } from './format';

const SMALL_BUTTON =
  'flex size-6 items-center justify-center rounded-chip text-fg-muted focus-ring hover:bg-tint hover:text-fg';

export interface NoteRowProps {
  note: NoteSummary;
  now: Date;
  selected: boolean;
  /** The one row that Tab reaches (the rest are reached with the arrow keys). */
  tabbable: boolean;
  /** The list shows Trash: Restore and Delete forever instead of the more button. */
  trash: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
  onRestore: () => void;
  onPurge: () => void;
}

/** One note in the list: pin, title, then the date and the start of the text. */
export function NoteRow({
  note,
  now,
  selected,
  tabbable,
  trash,
  onFocus,
  onOpen,
  onMenu,
  onRestore,
  onPurge,
}: NoteRowProps) {
  const stamp = trash && note.deletedAt ? note.deletedAt : note.updatedAt;
  const date = noteDate(stamp, now);
  const tabIndex = tabbable ? 0 : -1;
  // In Trash a row has no page to open: it is a plain group with its own buttons
  const Main = trash ? 'div' : 'button';

  return (
    <li
      className="group relative"
      onContextMenu={(event) => {
        if (trash) return;
        event.preventDefault();
        const more = event.currentTarget.querySelector<HTMLElement>('[data-menu-trigger]');
        if (more) onMenu(more);
      }}
    >
      <Main
        {...(trash
          ? { role: 'group' as const, 'aria-label': note.title }
          : { type: 'button' as const, onClick: onOpen })}
        data-note-row
        data-note-id={note.id}
        tabIndex={tabIndex}
        aria-current={selected ? 'true' : undefined}
        onFocus={onFocus}
        className={cx(
          'flex w-full flex-col gap-0.5 rounded-chip px-3 py-2 text-left focus-ring transition-colors duration-150 ease-out motion-reduce:transition-none',
          trash ? 'cursor-default pr-14' : 'pr-9',
          selected ? 'bg-tint' : 'hover:bg-tint',
        )}
      >
        {selected ? (
          <span
            aria-hidden
            className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full"
            style={{ backgroundColor: moduleColorVar('notes') }}
          />
        ) : null}
        <span className="flex items-center gap-1.5">
          {note.pinned ? (
            <>
              {/* Dark icon with a peach dot: peach alone is too pale on the light theme */}
              <span aria-hidden className="relative shrink-0">
                <IconPin size={12} stroke={1.75} className="text-fg" />
                <span
                  className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
                  style={{ backgroundColor: moduleColorVar('notes') }}
                />
              </span>
              <span className="sr-only">Pinned: </span>
            </>
          ) : null}
          <span className="truncate text-body font-medium text-fg">{note.title}</span>
        </span>
        <span className="truncate text-small text-fg-muted">
          {trash ? 'Deleted ' : ''}
          {date}
          {note.excerpt !== '' ? ` · ${note.excerpt}` : ''}
        </span>
      </Main>

      {trash ? (
        <div className="absolute top-2 right-1.5 flex gap-0.5">
          <Tooltip label="Restore">
            <button
              type="button"
              tabIndex={tabIndex}
              aria-label={`Restore: ${note.title}`}
              onClick={onRestore}
              className={SMALL_BUTTON}
            >
              <IconArrowBackUp size={14} stroke={1.5} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label="Delete forever">
            <button
              type="button"
              tabIndex={tabIndex}
              aria-label={`Delete forever: ${note.title}`}
              onClick={onPurge}
              className={SMALL_BUTTON}
            >
              <IconTrashX size={14} stroke={1.5} aria-hidden />
            </button>
          </Tooltip>
        </div>
      ) : (
        <button
          type="button"
          data-menu-trigger
          tabIndex={tabIndex}
          aria-haspopup="menu"
          aria-label={`More options for ${note.title}`}
          onClick={(event) => {
            onMenu(event.currentTarget);
          }}
          className={cx(
            SMALL_BUTTON,
            'absolute top-2 right-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
          )}
        >
          <IconDots size={14} stroke={1.5} aria-hidden />
        </button>
      )}
    </li>
  );
}
