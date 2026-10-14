import type { NoteLinks } from '@personal-os/shared';
import { Button, cx, SegmentedControl } from '@personal-os/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { ApiError } from '../../../api/api-client';
import { HistoryPanel } from '../history';
import { useNoteLinks } from '../links-queries';
import { useCreateNote, useNote } from '../notes-queries';
import { useNotesUi, type RightPanelTab } from '../notes-ui-store';
import { noteKeys } from '../query-keys';
import { useNotesNav } from '../shell/use-notes-nav';
import { jumpToHeading, useLiveOutline } from './outline-bus';
import { parseOutline } from './outline';
import { TagsSection } from './tags-section';
import { useRovingList } from './use-roving-list';

const TABS = [
  { value: 'links', label: 'Links' },
  { value: 'outline', label: 'Outline' },
  { value: 'history', label: 'History' },
] as const satisfies readonly { value: RightPanelTab; label: string }[];

const rowClass =
  'flex w-full flex-col gap-0.5 rounded-chip px-2 py-1.5 text-left focus-ring transition-colors duration-150 ease-out hover:bg-tint motion-reduce:transition-none';

const sectionTitle = 'px-2 text-small font-medium text-fg-muted';

function Message({ children, live }: { children: string; live?: boolean }) {
  return (
    <p className="px-2 text-body text-fg-muted" role={live ? 'status' : undefined}>
      {children}
    </p>
  );
}

function BacklinkList({ backlinks }: { backlinks: NoteLinks['backlinks'] }) {
  const nav = useNotesNav();
  const roving = useRovingList(backlinks.length);
  return (
    <ul className="flex flex-col" {...roving.listProps}>
      {backlinks.map((link, index) => (
        <li key={link.noteId}>
          <button
            type="button"
            {...roving.itemProps(index)}
            onClick={() => {
              nav.openNote(link.noteId);
            }}
            className={rowClass}
          >
            <span className="truncate text-body font-medium text-fg">{link.title}</span>
            {link.context !== '' ? (
              <span className="line-clamp-2 text-small text-fg-muted">{link.context}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface OutgoingListProps {
  outgoing: NoteLinks['outgoing'];
  onCreate: (title: string) => Promise<void>;
  creating: boolean;
}

function OutgoingList({ outgoing, onCreate, creating }: OutgoingListProps) {
  const nav = useNotesNav();
  const roving = useRovingList(outgoing.length);
  return (
    <ul className="flex flex-col" {...roving.listProps}>
      {outgoing.map((link, index) => {
        const target = link.noteId;
        return (
          <li key={link.target.toLowerCase()}>
            {target ? (
              <button
                type="button"
                {...roving.itemProps(index)}
                onClick={() => {
                  nav.openNote(target);
                }}
                className={rowClass}
              >
                <span className="truncate text-body text-fg">{link.target}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-chip px-2 py-1">
                <span
                  className="min-w-0 flex-1 truncate text-body text-fg-muted"
                  title="No note has this title yet"
                >
                  {link.target}
                </span>
                <button
                  type="button"
                  {...roving.itemProps(index)}
                  aria-label={`Create note: ${link.target}`}
                  disabled={creating}
                  onClick={() => {
                    void onCreate(link.target);
                  }}
                  className="h-7 shrink-0 rounded-chip px-2 text-small font-medium text-fg focus-ring hover:bg-tint disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface LinksTabProps {
  noteId: string;
  folderId: string | null;
}

function LinksTab({ noteId, folderId }: LinksTabProps) {
  const links = useNoteLinks(noteId);
  const create = useCreateNote();
  const nav = useNotesNav();

  if (links.isPending) return <Message live>Loading links…</Message>;
  if (links.isError) {
    return (
      <div className="flex flex-col items-start gap-2 px-2">
        <p className="text-body text-fg-muted">
          {links.error instanceof ApiError ? links.error.message : 'Could not load the links.'}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            void links.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { backlinks, outgoing }: NoteLinks = links.data;

  const createAndOpen = async (title: string) => {
    try {
      const made = await create.mutateAsync({ title, ...(folderId ? { folderId } : {}) });
      nav.openNote(made.id);
    } catch {
      // The hook already showed the server's message
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="backlinks-title" className="flex flex-col gap-1">
        <h3 id="backlinks-title" className={sectionTitle}>
          Backlinks ({backlinks.length})
        </h3>
        {backlinks.length === 0 ? (
          <Message>No notes link here yet.</Message>
        ) : (
          <BacklinkList backlinks={backlinks} />
        )}
      </section>

      <section aria-labelledby="outgoing-title" className="flex flex-col gap-1">
        <h3 id="outgoing-title" className={sectionTitle}>
          Outgoing links ({outgoing.length})
        </h3>
        {outgoing.length === 0 ? (
          <Message>This note links nowhere yet.</Message>
        ) : (
          <OutgoingList outgoing={outgoing} onCreate={createAndOpen} creating={create.isPending} />
        )}
      </section>

      <TagsSection noteId={noteId} />
    </div>
  );
}

function OutlineTab({ noteId, markdown }: { noteId: string; markdown: string }) {
  // The open editor's live headings; the saved text only while no editor has published any
  const live = useLiveOutline(noteId);
  const items = useMemo(() => live ?? parseOutline(markdown), [live, markdown]);
  const roving = useRovingList(items.length);
  if (items.length === 0) return <Message>No headings yet.</Message>;
  return (
    <ul className="flex flex-col" aria-label="Headings" {...roving.listProps}>
      {items.map((item, index) => (
        <li key={item.index}>
          <button
            type="button"
            {...roving.itemProps(index)}
            onClick={() => {
              jumpToHeading(item.index);
            }}
            style={{ paddingLeft: `${String(8 + (item.level - 1) * 12)}px` }}
            className={cx(
              'w-full truncate rounded-chip py-1.5 pr-2 text-left text-body focus-ring transition-colors duration-150 ease-out hover:bg-tint motion-reduce:transition-none',
              item.level === 1 ? 'font-medium text-fg' : 'text-fg-secondary',
            )}
          >
            {item.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Escape in the panel hands the focus back to the toggle that opened it (or the editor). */
function leavePanel(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  const target =
    document.querySelector<HTMLElement>('[data-right-panel-toggle]') ??
    document.querySelector<HTMLElement>('[data-notes-editor] .ProseMirror');
  target?.focus();
}

/**
 * The right panel of the editor: links of the open note, and its outline. The outline follows the
 * live editor document. The panel is not created again for another note, so the focus stays where
 * it is; what belongs to one note is reset from `noteId`.
 */
export function RightPanel({ noteId }: { noteId: string }) {
  const tab = useNotesUi((state) => state.rightPanelTab);
  const setTab = useNotesUi((state) => state.setRightPanelTab);
  const note = useNote(noteId);
  const client = useQueryClient();

  // A save (here or on another device) can change the links: fetch them again
  const revision = note.data?.revision;
  const seen = useRef<{ noteId: string; revision: number | undefined }>({ noteId, revision });
  useEffect(() => {
    const before = seen.current;
    seen.current = { noteId, revision };
    // The first load of a note (and opening another note) is not a change
    if (before.noteId !== noteId || before.revision === undefined || before.revision === revision) {
      return;
    }
    void client.invalidateQueries({ queryKey: noteKeys.links(noteId) });
  }, [revision, noteId, client]);

  return (
    <aside
      aria-label="Links, outline and history"
      onKeyDown={leavePanel}
      className="flex h-full min-h-0 w-[264px] shrink-0 flex-col gap-3 overflow-y-auto rounded-card glass p-3"
    >
      <SegmentedControl
        label="Panel"
        value={tab}
        options={TABS}
        onChange={setTab}
        className="self-stretch [&>button]:flex-1"
      />
      {tab === 'links' ? (
        <LinksTab noteId={noteId} folderId={note.data?.folderId ?? null} />
      ) : tab === 'outline' ? (
        <OutlineTab noteId={noteId} markdown={note.data?.contentMd ?? ''} />
      ) : (
        <HistoryPanel noteId={noteId} />
      )}
    </aside>
  );
}
