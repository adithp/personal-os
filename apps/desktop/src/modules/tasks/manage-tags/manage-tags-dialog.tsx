import { Button, IconButton, Input } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTags } from '../tags-queries';
import { useManageTags } from './manage-tags-store';
import { TagRow } from './tag-row';

const SEARCH_FROM = 8;
const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex="0"]';

/** The Manage tags dialog (decisions D13 to D20). Mounted once in the Tasks layout. */
export function ManageTagsDialog() {
  const open = useManageTags((state) => state.open);
  return open ? <TagsDialog /> : null;
}

function TagsDialog() {
  const close = useManageTags((state) => state.closeManageTags);
  const { data, isPending, isError, refetch } = useTags();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

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
        aria-label="Manage tags"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-[440px] max-w-[90vw] flex-col gap-3 rounded-card glass-strong p-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-section font-semibold text-fg">
            Tags {data ? <span className="font-normal text-fg-muted">{data.length}</span> : null}
          </h2>
          <IconButton aria-label="Close" icon={<IconX size={16} aria-hidden />} onClick={close} />
        </div>

        {data && data.length > SEARCH_FROM ? (
          <Input
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
            <p className="text-body text-fg-secondary">Could not load tags. Try again</p>
            <Button
              variant="secondary"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
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
              />
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-small text-fg-muted">
            Deleting a tag removes it from its tasks. The tasks stay.
          </p>
          <Button onClick={close}>Done</Button>
        </div>
      </div>
    </div>
  );
}
