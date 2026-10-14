import { cx } from '@personal-os/ui';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { ApiError } from '../../../api/api-client';
import { useTags } from '../../tasks/tags-queries';
import { tagPlace } from '../notes-search';
import { useNotesNav } from './use-notes-nav';

/**
 * The Tags part of the Notes side panel: the tags that notes use (written as #tag in the text), with
 * how many notes have each. Choosing one filters the note list; All notes clears the filter.
 */
export function TagsSection() {
  const nav = useNotesNav();
  const tags = useTags();
  const used = useMemo(
    () =>
      (tags.data ?? [])
        .filter((tag) => (tag.noteCount ?? 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    [tags.data],
  );

  return (
    <section aria-label="Tags" className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center pl-2.5">
        <h2 className="text-small font-medium text-fg-muted">Tags</h2>
      </div>

      {tags.isPending ? (
        <p role="status" className="px-2.5 text-small text-fg-muted">
          Loading tags…
        </p>
      ) : null}
      {tags.isError ? (
        <p role="alert" className="flex flex-col items-start gap-1 px-2.5 text-small text-fg-muted">
          {tags.error instanceof ApiError ? tags.error.message : 'Could not load tags.'}
          <button
            type="button"
            onClick={() => {
              void tags.refetch();
            }}
            className="rounded-chip text-fg underline focus-ring"
          >
            Try again
          </button>
        </p>
      ) : null}
      {tags.isSuccess && used.length === 0 ? (
        <p className="px-2.5 text-small text-fg-muted">Type #tag in a note to add one.</p>
      ) : null}

      {used.length > 0 ? (
        <ul aria-label="Tag list">
          {used.map((tag) => {
            const count = tag.noteCount ?? 0;
            const place = tagPlace(tag.id);
            const active = nav.place === place;
            return (
              <li key={tag.id}>
                <Link
                  to="/notes"
                  search={(previous) => ({
                    ...(previous.note ? { note: previous.note } : {}),
                    folder: place,
                  })}
                  aria-label={`#${tag.name}, ${String(count)} ${count === 1 ? 'note' : 'notes'}`}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-8 min-w-0 items-center gap-2 rounded-chip px-2.5 text-body focus-ring transition-colors duration-150 ease-out',
                    active
                      ? 'bg-tint font-medium text-fg'
                      : 'text-fg-secondary hover:bg-tint hover:text-fg',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate">{tag.name}</span>
                  <span aria-hidden className="ml-auto shrink-0 text-small text-fg-muted">
                    {count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
