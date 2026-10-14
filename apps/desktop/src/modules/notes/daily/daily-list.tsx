import { Button, cx } from '@personal-os/ui';
import { ApiError } from '../../../api/api-client';
import { EmptyState } from '../list/empty-state';
import { useNotes } from '../notes-queries';
import { useRovingList } from '../right-panel/use-roving-list';
import { useNotesNav } from '../shell/use-notes-nav';

/** A year of days; older ones would be cut by the server's default list size. */
const DAILY_LIST_LIMIT = 366;

/** The "Daily notes" view: notes that belong to a day, newest day first. */
export function DailyList() {
  const nav = useNotesNav();
  const notes = useNotes({ dailyOnly: true, limit: DAILY_LIST_LIMIT });
  const items = notes.data ?? [];
  const roving = useRovingList(items.length);

  return (
    <section
      aria-label="Daily notes"
      className="flex h-full min-h-0 w-[272px] shrink-0 flex-col gap-3 rounded-card glass p-3"
    >
      <header className="pl-1">
        <h2 className="truncate text-section font-semibold text-fg">Daily notes</h2>
        <p role="status" className="min-h-[15px] text-small text-fg-muted">
          {notes.isPending ? ' ' : `${String(items.length)} ${items.length === 1 ? 'day' : 'days'}`}
        </p>
      </header>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {notes.isPending ? (
          <p role="status" className="px-2 text-body text-fg-muted">
            Loading daily notes…
          </p>
        ) : null}
        {notes.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2 px-2">
            <p className="text-body text-fg">
              {notes.error instanceof ApiError
                ? notes.error.message
                : 'Could not load your daily notes.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void notes.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {notes.data && items.length === 0 ? (
          <EmptyState title="No daily notes yet" text="Open Today to write the first one." />
        ) : null}
        {items.length > 0 ? (
          <ul aria-label="Daily notes by day" className="flex flex-col" {...roving.listProps}>
            {items.map((note, index) => (
              <li key={note.id}>
                <button
                  type="button"
                  {...roving.itemProps(index)}
                  aria-current={nav.noteId === note.id ? 'true' : undefined}
                  onClick={() => {
                    nav.openNote(note.id);
                  }}
                  className={cx(
                    'flex w-full flex-col gap-0.5 rounded-chip px-3 py-2 text-left focus-ring hover:bg-tint',
                    nav.noteId === note.id && 'bg-tint',
                  )}
                >
                  <span className="truncate text-body font-medium text-fg">{note.title}</span>
                  {note.excerpt ? (
                    <span className="truncate text-small text-fg-muted">{note.excerpt}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {items.length >= DAILY_LIST_LIMIT ? (
          <p className="px-2 pt-2 text-small text-fg-muted">
            Showing the latest {String(DAILY_LIST_LIMIT)} days. Search finds older ones.
          </p>
        ) : null}
      </div>
    </section>
  );
}
