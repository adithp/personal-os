import type { Project } from '@personal-os/shared';
import { GlassCard, IconButton } from '@personal-os/ui';
import { IconLink, IconNotes, IconSearch, IconUnlink } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../api/api-client';
import { useNotes } from '../../notes/notes-queries';
import { formatDay } from '../format';
import { Loading, QueryError } from '../components';
import { useProjectActions, useProjectNotes } from '../projects-queries';

const OPTION = '[role="option"]';

/** "Link a note": a popover with a search box over all notes; choosing one links it. */
function LinkNotePopover({ project, linked }: { project: Project; linked: ReadonlySet<string> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const notes = useNotes({}, { enabled: open });
  const { setNoteProject } = useProjectActions();

  const close = () => {
    setOpen(false);
    setQuery('');
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const all = (notes.data ?? []).filter((note) => !linked.has(note.id));
  const needle = query.trim().toLowerCase();
  const shown = needle ? all.filter((note) => note.title.toLowerCase().includes(needle)) : all;

  const choose = (noteId: string) => {
    setNoteProject.mutate({
      noteId,
      projectId: project.id,
      message: `Linked to ${project.title}.`,
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const options = [...(list.current?.querySelectorAll<HTMLElement>(OPTION) ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      options[index + 1 < options.length ? index + 1 : 0]?.focus();
    } else if (event.key === 'ArrowUp' && index >= 0) {
      event.preventDefault();
      if (index === 0) search.current?.focus();
      else options[index - 1]?.focus();
    } else if (event.key === 'Enter' && document.activeElement === search.current) {
      const first = shown[0];
      if (first) {
        event.preventDefault();
        choose(first.id);
      }
    }
  };

  return (
    <div ref={wrapper} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="inline-flex h-[34px] items-center justify-center gap-2 rounded-control glass px-4 text-body font-medium text-fg focus-ring transition-colors duration-150 ease-out hover:bg-input motion-reduce:transition-none"
      >
        <IconLink size={14} stroke={1.5} aria-hidden />
        Link a note
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="Link notes to this project"
          className="absolute top-full right-0 z-30 mt-1 flex w-[320px] max-w-[90vw] flex-col gap-1 rounded-card glass-strong p-1.5"
        >
          <label className="flex h-[34px] items-center gap-2 rounded-control bg-input px-2.5">
            <IconSearch size={14} stroke={1.5} className="shrink-0 text-fg-muted" aria-hidden />
            <input
              ref={search}
              type="text"
              aria-label="Search notes"
              placeholder="Search notes"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
          <div
            ref={list}
            role="listbox"
            aria-label="Notes"
            className="flex max-h-64 flex-col overflow-y-auto"
          >
            {shown.map((note) => (
              <button
                key={note.id}
                type="button"
                role="option"
                aria-selected={false}
                tabIndex={-1}
                onClick={() => {
                  choose(note.id);
                }}
                className="flex min-h-7 items-center gap-2 rounded-chip px-2 py-1 text-left text-body text-fg focus-ring hover:bg-input focus-visible:bg-input"
              >
                <span className="min-w-0 flex-1 truncate">{note.title}</span>
              </button>
            ))}
          </div>
          {notes.isPending ? (
            <p role="status" className="px-2 py-1.5 text-small text-fg-secondary">
              Loading notes…
            </p>
          ) : null}
          {notes.isError ? (
            <p role="alert" className="px-2 py-1.5 text-small text-fg-secondary">
              {notes.error instanceof ApiError ? notes.error.message : 'Could not load your notes.'}
            </p>
          ) : null}
          {notes.isSuccess && shown.length === 0 ? (
            <p className="px-2 py-1.5 text-small text-fg-muted">
              {all.length === 0 ? 'No other notes.' : 'No matching notes.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The Notes tab: the notes linked to the project; open, link and unlink. */
export function NotesTab({ project }: { project: Project }) {
  const notes = useProjectNotes(project.id);
  const { setNoteProject } = useProjectActions();
  const list = notes.data ?? [];
  const linked = new Set(list.map((note) => note.id));

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section font-medium text-fg">Notes</h2>
        <LinkNotePopover project={project} linked={linked} />
      </div>
      {notes.isPending ? <Loading text="Loading notes…" /> : null}
      {notes.isError ? (
        <QueryError
          error={notes.error}
          fallback="Could not load the notes."
          onRetry={() => {
            void notes.refetch();
          }}
        />
      ) : null}
      {notes.isSuccess && list.length === 0 ? (
        <p className="text-body text-fg-muted">No notes linked yet. Use "Link a note".</p>
      ) : null}
      {list.length > 0 ? (
        <ul aria-label="Linked notes" className="flex flex-col">
          {list.map((note) => (
            <li
              key={note.id}
              className="group flex min-h-9 items-center gap-2 rounded-chip px-2 hover:bg-input"
            >
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-chip bg-module-notes text-on-tile"
              >
                <IconNotes size={12} stroke={1.5} />
              </span>
              <Link
                to="/notes"
                search={{ note: note.id }}
                className="min-w-0 flex-1 truncate rounded-chip text-body text-fg focus-ring"
              >
                {note.title}
              </Link>
              <span className="shrink-0 text-small text-fg-muted">{formatDay(note.updatedAt)}</span>
              <IconButton
                aria-label={`Unlink note: ${note.title}`}
                icon={<IconUnlink size={14} aria-hidden />}
                className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                onClick={() => {
                  setNoteProject.mutate({
                    noteId: note.id,
                    projectId: null,
                    message: `Unlinked from ${project.title}.`,
                  });
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </GlassCard>
  );
}
