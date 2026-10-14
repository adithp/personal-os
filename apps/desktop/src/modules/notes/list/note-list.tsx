import {
  NOTE_LIST_LIMIT_DEFAULT,
  NOTE_LIST_LIMIT_MAX,
  NOTE_SORTS,
  type ListNotesInput,
  type NoteSort,
  type NoteSummary,
} from '@personal-os/shared';
import { Button, cx, IconButton, Input, Tooltip } from '@personal-os/ui';
import { IconSortDescending } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { useNow } from '../../dashboard/greeting';
import { AnchoredMenu, MenuItem } from '../../tasks/favorites/anchored-menu';
import { useTags } from '../../tasks/tags-queries';
import { useOpenDaily } from '../daily/use-open-daily';
import { useNoteFolders } from '../folders-queries';
import { isFolderPlace, tagIdOf } from '../notes-search';
import {
  useCreateNote,
  useDeleteNote,
  useEmptyTrash,
  useMoveNote,
  useNotes,
  usePinNote,
  usePurgeNote,
  useRestoreNote,
} from '../notes-queries';
import { useNotesUi } from '../notes-ui-store';
import { NotesShortcutsHelp } from '../shell/shortcuts-help';
import { useNotesNav } from '../shell/use-notes-nav';
import { focusEditor } from './focus-editor';
import { ConfirmDialog } from './confirm-dialog';
import { FolderPickerMenu } from '../shell/folder-menus';
import { filterByTitle, pinnedFirst } from './format';
import { NewNoteMenu } from './new-note-menu';
import { NoteRow } from './note-row';
import { EmptyState } from './empty-state';
import { useNotesShortcuts } from './use-notes-shortcuts';

const SORT_LABELS: Record<NoteSort, string> = {
  updated: 'Last edited',
  title: 'Title',
  created: 'Created',
};

interface RowMenu {
  note: NoteSummary;
  anchor: HTMLElement;
  mode: 'actions' | 'move';
}
type Confirm = { kind: 'purge'; note: NoteSummary } | { kind: 'empty' };

/** The note list: header, a filter field, the rows of the place shown, and Trash actions. */
export function NoteList() {
  const nav = useNotesNav();
  const now = useNow();
  const sort = useNotesUi((state) => state.sort);
  const setSort = useNotesUi((state) => state.setSort);
  const folders = useNoteFolders();
  const tagsQuery = useTags();
  const trash = nav.place === 'trash';
  const folderPlace = isFolderPlace(nav.place);
  const folder = folderPlace ? folders.data?.find((f) => f.id === nav.place) : null;
  const tagId = tagIdOf(nav.place);
  const tagName = tagId === null ? null : tagsQuery.data?.find((t) => t.id === tagId)?.name;

  const [limit, setLimit] = useState(NOTE_LIST_LIMIT_DEFAULT);
  const [filter, setFilter] = useState('');
  const [tabId, setTabId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const listRoot = useRef<HTMLUListElement>(null);
  const filterBox = useRef<HTMLInputElement>(null);

  const filters: ListNotesInput = {
    ...(trash
      ? { trash: true }
      : tagId !== null
        ? { tagId }
        : folderPlace
          ? { folderId: nav.place }
          : {}),
    sort,
    limit,
  };
  const notes = useNotes(filters);
  const create = useCreateNote();
  const del = useDeleteNote();
  const restore = useRestoreNote();
  const purge = usePurgeNote();
  const emptyTrash = useEmptyTrash();
  const pin = usePinNote();
  const move = useMoveNote();
  const daily = useOpenDaily();

  const loaded = useMemo(() => notes.data ?? [], [notes.data]);
  const shown = useMemo(() => filterByTitle(pinnedFirst(loaded), filter), [loaded, filter]);
  const byId = useMemo(() => new Map(loaded.map((note) => [note.id, note])), [loaded]);
  const tabbableId =
    tabId !== null && shown.some((n) => n.id === tabId) ? tabId : (shown[0]?.id ?? null);
  // A failed background refresh keeps the rows on screen; the error shows in a bar above them
  const ready = !notes.isPending && (!notes.isError || notes.data !== undefined);
  const filtering = filter.trim() !== '';

  const placeName = trash
    ? 'Trash'
    : tagId !== null
      ? `#${tagName ?? 'tag'}`
      : nav.place === 'all'
        ? 'All notes'
        : (folder?.name ?? 'Folder');
  const countText = !ready
    ? ' '
    : filtering
      ? `${String(shown.length)} of ${String(loaded.length)}`
      : `${String(loaded.length)} ${loaded.length === 1 ? 'note' : 'notes'}`;

  const createNote = async () => {
    if (create.isPending) return;
    try {
      const note = await create.mutateAsync(folderPlace ? { folderId: nav.place } : {});
      nav.show(trash ? 'all' : nav.place, note.id);
    } catch {
      // The hook showed the server's message
    }
  };

  // Moves the focus to the row next to a note that is leaving the list
  const keepPlace = (noteId: string) => {
    const inList = listRoot.current?.contains(document.activeElement) === true;
    if (!inList) return;
    const index = shown.findIndex((note) => note.id === noteId);
    const neighbor = shown[index + 1] ?? shown[index - 1];
    if (neighbor) {
      listRoot.current?.querySelector<HTMLElement>(`[data-note-id="${neighbor.id}"]`)?.focus();
    } else {
      filterBox.current?.focus();
    }
  };

  const trashNote = (note: NoteSummary) => {
    keepPlace(note.id);
    if (nav.noteId === note.id) nav.openNote(null, true);
    del.mutate(note.id);
  };
  const restoreNote = (note: NoteSummary) => {
    keepPlace(note.id);
    restore.mutate(note.id);
  };

  const openNote = (note: NoteSummary) => {
    nav.openNote(note.id);
  };

  useNotesShortcuts({
    rootRef: listRoot,
    onNew: () => {
      void createNote();
    },
    onOpen: (id) => {
      const note = byId.get(id);
      if (!note) return;
      if (trash) {
        restoreNote(note);
        return;
      }
      openNote(note);
      focusEditor();
    },
    onDelete: (id) => {
      const note = byId.get(id);
      if (!note) return;
      if (trash) setConfirm({ kind: 'purge', note });
      else trashNote(note);
    },
    onDaily: () => {
      if (!daily.isPending) void daily.open();
    },
    onHelp: () => {
      setHelpOpen(true);
    },
  });

  const closeRowMenu = (returnFocus: boolean) => {
    if (returnFocus) rowMenu?.anchor.focus();
    setRowMenu(null);
  };

  const emptyState = () => {
    if (filtering) {
      return (
        <EmptyState
          title="No matching notes"
          text={`No loaded note has “${filter.trim()}” in its title.`}
        />
      );
    }
    if (trash)
      return (
        <EmptyState
          title="Trash is empty"
          text="Notes you delete wait here until you remove them for good."
        />
      );
    if (tagId !== null)
      return (
        <EmptyState
          title="No notes with this tag"
          text={`Notes that have #${tagName ?? 'the tag'} in their text show here.`}
        />
      );
    return (
      <EmptyState
        title={folder ? 'This folder is empty' : 'No notes yet'}
        text={folder ? 'Create a note here or move one in.' : 'Write your first note.'}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void createNote();
            }}
          >
            New note
          </Button>
        }
      />
    );
  };

  return (
    <section
      aria-label="Notes list"
      className="flex h-full min-h-0 w-[272px] shrink-0 flex-col gap-3 rounded-card glass p-3"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 pl-1">
          <h2 className="truncate text-section font-semibold text-fg">{placeName}</h2>
          <p role="status" className="min-h-[15px] text-small text-fg-muted">
            {countText}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip label="Keyboard shortcuts">
            <IconButton
              aria-label="Keyboard shortcuts"
              icon={
                <span aria-hidden className="text-body">
                  ?
                </span>
              }
              onClick={() => {
                setHelpOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip label="Sort notes">
            <IconButton
              aria-label="Sort notes"
              aria-haspopup="menu"
              icon={<IconSortDescending size={16} stroke={1.5} aria-hidden />}
              onClick={(event) => {
                setSortAnchor(event.currentTarget);
              }}
            />
          </Tooltip>
          {trash ? null : (
            <NewNoteMenu
              {...(nav.place !== 'all' ? { folderId: nav.place } : {})}
              onCreated={(note) => {
                nav.show(nav.place, note.id);
              }}
            />
          )}
        </div>
      </header>

      <Input
        ref={filterBox}
        type="search"
        aria-label="Filter notes"
        placeholder="Filter notes"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            listRoot.current?.querySelector<HTMLElement>('[data-note-row]')?.focus();
          } else if (event.key === 'Escape' && filter !== '') {
            event.preventDefault();
            setFilter('');
          }
        }}
      />

      {trash && ready && loaded.length > 0 ? (
        <Button
          variant="secondary"
          onClick={() => {
            setConfirm({ kind: 'empty' });
          }}
        >
          Empty trash
        </Button>
      ) : null}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {notes.isPending ? (
          <p role="status" className="px-2 text-body text-fg-muted">
            Loading notes…
          </p>
        ) : null}
        {notes.isError ? (
          <div
            role="alert"
            className={cx(
              'flex flex-col items-start gap-2 px-2',
              ready && 'mb-2 rounded-control bg-input py-2',
            )}
          >
            <p className="text-body text-fg">
              {notes.error instanceof ApiError ? notes.error.message : 'Could not load your notes.'}
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
        {ready && shown.length === 0 ? emptyState() : null}
        {ready && shown.length > 0 ? (
          <ul
            ref={listRoot}
            aria-label={trash ? 'Notes in trash' : 'Notes'}
            className="flex flex-col"
          >
            {shown.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                now={now}
                selected={!trash && nav.noteId === note.id}
                tabbable={tabbableId === note.id}
                trash={trash}
                onFocus={() => {
                  setTabId(note.id);
                }}
                onOpen={() => {
                  openNote(note);
                }}
                onMenu={(anchor) => {
                  setRowMenu({ note, anchor, mode: 'actions' });
                }}
                onRestore={() => {
                  restoreNote(note);
                }}
                onPurge={() => {
                  setConfirm({ kind: 'purge', note });
                }}
              />
            ))}
          </ul>
        ) : null}
        {ready &&
        (loaded.length >= limit || notes.isPlaceholderData) &&
        limit < NOTE_LIST_LIMIT_MAX ? (
          <Button
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => {
              setLimit((current) =>
                Math.min(current + NOTE_LIST_LIMIT_DEFAULT, NOTE_LIST_LIMIT_MAX),
              );
            }}
          >
            Show more
          </Button>
        ) : null}
      </div>

      {sortAnchor ? (
        <AnchoredMenu
          anchor={sortAnchor}
          label="Sort notes"
          align="end"
          onClose={(returnFocus) => {
            if (returnFocus) sortAnchor.focus();
            setSortAnchor(null);
          }}
        >
          {NOTE_SORTS.map((key) => (
            <MenuItem
              key={key}
              role="menuitemradio"
              checked={sort === key}
              onSelect={() => {
                setSort(key);
                sortAnchor.focus();
                setSortAnchor(null);
              }}
            >
              {SORT_LABELS[key]}
            </MenuItem>
          ))}
        </AnchoredMenu>
      ) : null}

      {rowMenu?.mode === 'actions' ? (
        <AnchoredMenu
          anchor={rowMenu.anchor}
          label={`Actions for ${rowMenu.note.title}`}
          align="end"
          onClose={closeRowMenu}
        >
          <MenuItem
            onSelect={() => {
              const { note } = rowMenu;
              closeRowMenu(true);
              pin.mutate({ id: note.id, pinned: !note.pinned });
            }}
          >
            {rowMenu.note.pinned ? 'Unpin' : 'Pin'}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setRowMenu({ ...rowMenu, mode: 'move' });
            }}
          >
            Move to…
          </MenuItem>
          <MenuItem
            onSelect={() => {
              const { note } = rowMenu;
              setRowMenu(null);
              trashNote(note);
            }}
          >
            <span className="text-danger">Move to trash</span>
          </MenuItem>
        </AnchoredMenu>
      ) : null}
      {rowMenu?.mode === 'move' ? (
        <FolderPickerMenu
          anchor={rowMenu.anchor}
          label={`Move ${rowMenu.note.title} to`}
          folders={folders.data ?? []}
          currentId={rowMenu.note.folderId}
          noneLabel="No folder"
          onPick={(folderId) => {
            if (folderId !== rowMenu.note.folderId) {
              move.mutate({ id: rowMenu.note.id, folderId });
            }
          }}
          onClose={closeRowMenu}
        />
      ) : null}

      {confirm?.kind === 'purge' ? (
        <ConfirmDialog
          title="Delete forever?"
          message={`“${confirm.note.title}” will be deleted for good. This cannot be undone.`}
          confirmLabel="Delete forever"
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => {
            keepPlace(confirm.note.id);
            purge.mutate(confirm.note.id);
            setConfirm(null);
          }}
        />
      ) : null}
      {confirm?.kind === 'empty' ? (
        <ConfirmDialog
          title="Empty trash?"
          message={`${String(loaded.length)} ${loaded.length === 1 ? 'note' : 'notes'} will be deleted for good. This cannot be undone.`}
          confirmLabel="Empty trash"
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => {
            emptyTrash.mutate();
            setConfirm(null);
          }}
        />
      ) : null}
      {helpOpen ? (
        <NotesShortcutsHelp
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
