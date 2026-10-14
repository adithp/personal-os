import { parseTags } from '@personal-os/shared';
import { useMemo } from 'react';
import { useTags } from '../../tasks/tags-queries';
import { useNote } from '../notes-queries';
import { tagPlace } from '../notes-search';
import { useNotesNav } from '../shell/use-notes-nav';
import { useRovingList } from './use-roving-list';

/**
 * The tags written in the open note (`#tag` in its text), in the Links tab. Choosing one shows the
 * notes with that tag in the list. Tags are only changed through the text.
 */
export function TagsSection({ noteId }: { noteId: string }) {
  const note = useNote(noteId);
  const tags = useTags();
  const nav = useNotesNav();
  const names = useMemo(() => parseTags(note.data?.contentMd ?? ''), [note.data?.contentMd]);
  const byName = useMemo(
    () => new Map((tags.data ?? []).map((tag) => [tag.name.toLowerCase(), tag])),
    [tags.data],
  );
  const roving = useRovingList(names.length);

  return (
    <section aria-labelledby="note-tags-title" className="flex flex-col gap-1">
      <h3 id="note-tags-title" className="px-2 text-small font-medium text-fg-muted">
        Tags ({names.length})
      </h3>
      {names.length === 0 ? (
        <p className="px-2 text-body text-fg-muted">Type #tag in the text to add one.</p>
      ) : (
        <ul className="flex flex-col" {...roving.listProps}>
          {names.map((name, index) => {
            const tag = byName.get(name.toLowerCase());
            return (
              <li key={name.toLowerCase()}>
                <button
                  type="button"
                  {...roving.itemProps(index)}
                  // A tag the server has not saved yet cannot be a filter (still reachable by keys)
                  aria-disabled={!tag}
                  aria-label={`Show notes tagged #${name}`}
                  onClick={() => {
                    if (tag) nav.showPlace(tagPlace(tag.id));
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-chip px-2 text-left text-body text-fg focus-ring transition-colors duration-150 ease-out hover:bg-tint aria-disabled:text-fg-muted motion-reduce:transition-none"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full bg-accent"
                    style={tag ? { backgroundColor: tag.color } : undefined}
                  />
                  <span className="truncate">#{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
