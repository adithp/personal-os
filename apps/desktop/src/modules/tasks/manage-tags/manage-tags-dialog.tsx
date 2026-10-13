import { Button, Input } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../api/api-client';
import { useTagNotice, useTags } from '../tags-queries';
import { GHOST_BUTTON } from './ghost-button';
import { useManageTags } from './manage-tags-store';
import { TagRow } from './tag-row';

const SEARCH_FROM = 8;
/** How long the Undo line under the list stays. */
const NOTICE_MS = 8000;
const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex="0"]';

/** The Manage tags dialog (decisions D13 to D20). Mounted once in the Tasks layout. */
export function ManageTagsDialog() {
  const open = useManageTags((state) => state.open);
  return open ? <TagsDialog /> : null;
}

function TagsDialog() {
  const close = useManageTags((state) => state.closeManageTags);
  const { data, error, isPending, isError, refetch } = useTags();
  const notice = useTagNotice((state) => state.notice);
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  /** A row that a delete or merge is about to remove, and the row that takes the focus. */
  const gone = useRef<{ id: string; focusId: string | null } | null>(null);

  // Focus moves in on open and back to whatever opened the dialog on close
  useEffect(() => {
    const before = document.activeElement;
    box.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before !== document.body) before.focus();
    };
  }, []);

  const tags = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const shown = query.trim()
    ? tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()))
    : tags;
  const activeRow = shown.find((tag) => tag.id === activeId) ?? shown[0];

  // The Undo line belongs to this dialog: no stale one on open, none left behind on close
  useEffect(() => {
    useTagNotice.getState().set(null);
    return () => {
      useTagNotice.getState().set(null);
    };
  }, []);

  // ...and goes away after a few seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      useTagNotice.getState().set(null);
    }, NOTICE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);

  const expectGone = (id: string) => {
    const index = shown.findIndex((tag) => tag.id === id);
    gone.current = { id, focusId: shown[index + 1]?.id ?? shown[index - 1]?.id ?? null };
  };

  // After a delete or merge the focus goes to the next row, else the previous, else search or Done
  useEffect(() => {
    const pending = gone.current;
    if (!pending || shown.some((tag) => tag.id === pending.id)) return;
    gone.current = null;
    const next = pending.focusId
      ? box.current?.querySelector<HTMLElement>(`[data-tag-row="${pending.focusId}"]`)
      : null;
    (next ?? search.current ?? done.current)?.focus();
  });

  // A deleted or merged row takes the focus with it: bring it back into the dialog
  useEffect(() => {
    if (document.activeElement === document.body) box.current?.focus();
  }, [shown.length]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      const stops = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const first = stops[0];
      const last = stops.at(-1);
      if (!first || !last) return;
      const here = document.activeElement;
      if (event.shiftKey && (here === first || here === box.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && here === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target as HTMLElement;
    const rows = [...(box.current?.querySelectorAll<HTMLElement>('[data-tag-row]') ?? [])];
    const onRow = target.hasAttribute('data-tag-row');
    if (!onRow && target !== box.current && target.tagName !== 'INPUT') return;
    if (target.tagName === 'INPUT' && target.closest('[data-tag-row]')) return;
    event.preventDefault();
    const index = onRow ? rows.indexOf(target) : -1;
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-[440px] max-w-[90vw] flex-col gap-3 rounded-card glass-strong p-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-section font-semibold text-fg">
            <span id={titleId}>Tags</span>{' '}
            {data ? <span className="font-normal text-fg-muted">{data.length}</span> : null}
          </h2>
          <button type="button" aria-label="Close" onClick={close} className={GHOST_BUTTON}>
            <IconX size={16} aria-hidden />
          </button>
        </div>

        {data && data.length > SEARCH_FROM ? (
          <Input
            ref={search}
            aria-label="Find a tag"
            placeholder="Find a tag"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        ) : null}

        {isPending ? (
          <div
            aria-busy="true"
            aria-label="Loading tags"
            role="status"
            className="flex flex-col gap-1"
          >
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-9 rounded-control bg-input motion-safe:animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="flex items-center justify-between gap-3">
            <p className="text-body text-fg-secondary">
              {error instanceof ApiError ? error.message : 'Could not load tags.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-body text-fg-muted">
            {tags.length === 0 ? 'No tags yet. Type #tag in a task to make one.' : 'No tags match.'}
          </p>
        ) : (
          <ul aria-label="Tags" className="flex max-h-[360px] flex-col overflow-y-auto">
            {shown.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                all={tags}
                active={tag.id === activeRow?.id}
                onActivate={() => {
                  setActiveId(tag.id);
                }}
                onGone={() => {
                  expectGone(tag.id);
                }}
              />
            ))}
          </ul>
        )}

        <div role="status" className="empty:hidden">
          {notice ? (
            <div className="flex items-center justify-between gap-3 text-small text-fg-secondary">
              <span>{notice.message}</span>
              <Button
                variant="secondary"
                className="h-7 px-3"
                onClick={() => {
                  notice.undo();
                  useTagNotice.getState().set(null);
                  done.current?.focus();
                }}
              >
                Undo
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-small text-fg-muted">
            Deleting a tag removes it from its tasks. The tasks stay.
          </p>
          <Button ref={done} onClick={close}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
