import type { Note, NoteTitle } from '@personal-os/shared';
import { Button } from '@personal-os/ui';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../../api/api-client';
import { useTags } from '../../tasks/tags-queries';
import { useNoteTitles } from '../links-queries';
import { useCreateNote, useNote, useRenameNote, useUpdateNote } from '../notes-queries';
import { RightPanelToggle, headingsOf, publishOutline, registerHeadingJump } from '../right-panel';
import { useNotesNav } from '../shell/use-notes-nav';
import { editedLabel } from './edited-label';
import { createNoteExtensions } from './extensions';
import './note-editor.css';
import { reloadQuietly } from './quiet-reload';
import { serializeNote } from './serialize';
import { refreshNoteTags, type NoteTagInfo } from './tags/note-tags';
import { readDraft, useAutosave, type SaveFn, type SaveStatus } from './use-autosave';
import { LINK_UNKNOWN, refreshWikilinks } from './wikilink/wikilink';
import { onWindowCloseFlush } from './window-close';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  failed: 'Not saved, retrying',
};

const GONE_TEXT = 'This note no longer exists.';

/** The top bar and a message, for a note that is loading or cannot be shown (the panel toggle stays). */
function PaneMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-end gap-2 px-6">
        <RightPanelToggle />
      </div>
      {children}
    </div>
  );
}

/** Loads one note and shows the editor for it. */
export function NoteEditorPane({ noteId }: { noteId: string }) {
  const query = useNote(noteId);
  if (query.isPending) {
    return (
      <PaneMessage>
        <div className="p-6 text-body text-fg-muted" role="status">
          Loading note…
        </div>
      </PaneMessage>
    );
  }
  if (query.isError) {
    // The note is gone (deleted for good elsewhere): trying again cannot help
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <PaneMessage>
          <div className="p-6 text-body text-fg-secondary" role="alert">
            {GONE_TEXT}
          </div>
        </PaneMessage>
      );
    }
    return (
      <PaneMessage>
        <div className="flex flex-col items-start gap-3 p-6" role="alert">
          <p className="text-body text-fg-secondary">
            {query.error instanceof ApiError ? query.error.message : 'Could not load this note.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      </PaneMessage>
    );
  }
  // One editor per note: switching notes unmounts this one, which saves its text first
  return <NoteEditor key={noteId} note={query.data} refetch={query.refetch} />;
}

/** The wikilink options for one editor, plus the setters that keep them current. */
function createLinkBridge() {
  let ids = new Map<string, string>();
  let titles: (NoteTitle & { lower: string })[] = [];
  // False until the list of titles has loaded: before that no link is known to be missing
  let loaded = false;
  let open: (title: string) => void = () => undefined;
  const idOf = (title: string) => ids.get(title.trim().toLowerCase());
  return {
    options: {
      resolve: (title: string) => (loaded ? (idOf(title) ?? null) : LINK_UNKNOWN),
      getTitles: () => titles,
      onOpen: (title: string) => {
        open(title);
      },
    },
    idOf,
    isLoaded: () => loaded,
    setTitles(next: NoteTitle[] | undefined) {
      loaded = next !== undefined;
      titles = (next ?? []).map((item) => ({ ...item, lower: item.title.toLowerCase() }));
      ids = new Map(titles.map((item) => [item.lower, item.id]));
    },
    setOpen(next: (title: string) => void) {
      open = next;
    },
  };
}

/** The tag options for one editor (colors and the `#` menu), plus the setter that keeps them current. */
function createTagBridge() {
  let tags: NoteTagInfo[] = [];
  return {
    options: { getTags: () => tags },
    set(next: NoteTagInfo[]) {
      tags = next;
    },
  };
}

interface NoteEditorProps {
  note: Note;
  refetch: () => Promise<{ data?: Note }>;
}

function NoteEditor({ note, refetch }: NoteEditorProps) {
  const update = useUpdateNote();
  const rename = useRenameNote();
  const [editedAt, setEditedAt] = useState(note.updatedAt);
  const [now, setNow] = useState(() => Date.now());
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  // The text this editor last loaded, sent or took from the server (see the revision effect)
  const knownContent = useRef(note.contentMd);
  // The highest revision this editor has seen or caused: only a higher one is news from elsewhere
  const seenRevision = useRef(note.revision);
  const nav = useNotesNav();
  const createNote = useCreateNote();
  const titlesQuery = useNoteTitles();
  const titles = titlesQuery.data;
  const refetchTitles = titlesQuery.refetch;
  // True while a link click is creating a note: more clicks wait for it
  const creating = useRef(false);
  // The wikilink callbacks are created once; they read the latest values through this bridge
  const [bridge] = useState(createLinkBridge);
  // The tags for the colors and the `#` menu, read through a ref like the titles above
  const tagsQuery = useTags();
  const [tagBridge] = useState(createTagBridge);
  const [extensions] = useState(() => createNoteExtensions(bridge.options, tagBridge.options));

  const save: SaveFn = async (markdown, baseRevision, options) => {
    knownContent.current = markdown;
    try {
      const saved = await update.mutateAsync({
        id: note.id,
        baseRevision,
        contentMd: markdown,
        ...(options?.force ? { force: true } : {}),
      });
      seenRevision.current = Math.max(seenRevision.current, saved.revision);
      setEditedAt(saved.updatedAt);
      return { revision: saved.revision };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'note_conflict') {
        return { conflict: true };
      }
      if (error instanceof ApiError && error.status === 404) return { gone: true };
      throw error;
    }
  };

  const autosave = useAutosave({
    noteId: note.id,
    baseRevision: note.revision,
    save,
    onTakeTheirs: async () => {
      // The conflict bar stays until the server's version is really loaded
      const theirs = (await refetch()).data;
      if (!theirs) return false;
      knownContent.current = theirs.contentMd;
      seenRevision.current = Math.max(seenRevision.current, theirs.revision);
      editorRef.current?.commands.setContent(theirs.contentMd, {
        contentType: 'markdown',
        emitUpdate: false,
      });
      autosave.setRevision(theirs.revision);
      setEditedAt(theirs.updatedAt);
      return true;
    },
  });

  const readOnly = note.deletedAt !== null || autosave.gone;

  const editor = useEditor({
    extensions,
    content: note.contentMd,
    contentType: 'markdown',
    editable: note.deletedAt === null,
    editorProps: { attributes: { class: 'note-editor', 'aria-label': 'Note text' } },
    onUpdate: ({ editor: current }) => {
      autosave.change(() => (current.isDestroyed ? null : serializeNote(current)));
    },
    onBlur: () => {
      void autosave.flush();
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  });
  useEffect(() => {
    // false: do not report it as an edit (that would save an unchanged note)
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  // Links: the latest titles for the callbacks, and a new look at every link when they change
  useEffect(() => {
    bridge.setTitles(titles);
    if (!editor.isDestroyed) refreshWikilinks(editor);
  }, [bridge, editor, titles]);
  const tagData = tagsQuery.data;
  useEffect(() => {
    tagBridge.set((tagData ?? []).map(({ name, color }) => ({ name, color })));
    if (!editor.isDestroyed) refreshNoteTags(editor);
  }, [editor, tagBridge, tagData]);
  const { folderId } = note;
  const { openNote } = nav;
  useEffect(() => {
    bridge.setOpen((title) => {
      // A note in the trash is read-only: its links are only text. Titles still loading: wait
      if (!editor.isEditable || creating.current || !bridge.isLoaded()) return;
      const id = bridge.idOf(title);
      if (id) {
        openNote(id);
        return;
      }
      // A link to a note that does not exist yet creates it next to this one
      creating.current = true;
      createNote
        .mutateAsync({ title, folderId })
        .then(
          (created) => {
            openNote(created.id);
          },
          async (error: unknown) => {
            // The hook already showed the message. If the title was taken, open that note
            if (
              error instanceof ApiError &&
              error.status === 409 &&
              error.code === 'note_title_taken'
            ) {
              const existing = (await refetchTitles()).data?.find(
                (item) => item.title.toLowerCase() === title.toLowerCase(),
              );
              if (existing) openNote(existing.id);
            }
          },
        )
        .finally(() => {
          creating.current = false;
        });
    });
  });

  // The Outline tab asks for the i-th heading; headingsOf is the rule that makes its list too
  useEffect(
    () =>
      registerHeadingJump((index) => {
        const target = headingsOf(editor.state.doc)[index];
        if (!target) return;
        editor
          .chain()
          .focus()
          .setTextSelection(target.pos + 1)
          .scrollIntoView()
          .run();
      }),
    [editor],
  );
  // The Outline tab lists the headings of the live document, so it follows typing at once
  useEffect(() => {
    let unpublish = publishOutline(note.id, headingsOf(editor.state.doc));
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return;
      unpublish = publishOutline(note.id, headingsOf(editor.state.doc));
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
      unpublish();
    };
  }, [editor, note.id]);

  // A new revision from elsewhere (another device, a rename, an undo). Same text: just follow the
  // revision. New text and nothing unsaved: load it quietly. New text over unsaved edits: ask.
  const { setRevision, hasPending, markConflict } = autosave;
  // Counts finished IME compositions: a reload that waited for one is tried again
  const [compositions, setCompositions] = useState(0);
  useEffect(() => {
    const dom = editor.view.dom;
    const onEnd = () => {
      setCompositions((count) => count + 1);
    };
    dom.addEventListener('compositionend', onEnd);
    return () => {
      dom.removeEventListener('compositionend', onEnd);
    };
  }, [editor]);
  useEffect(() => {
    if (note.revision <= seenRevision.current) return;
    if (note.contentMd === knownContent.current) {
      seenRevision.current = note.revision;
      setRevision(note.revision);
    } else if (hasPending()) {
      seenRevision.current = note.revision;
      markConflict(note.revision);
    } else {
      // Replacing the text under an IME composition would break it: wait for compositionend
      if (editor.view.composing) return;
      seenRevision.current = note.revision;
      knownContent.current = note.contentMd;
      // Not an edit to save; the cursor stays and the undo history starts fresh
      reloadQuietly(editor, note.contentMd);
      setRevision(note.revision);
    }
  }, [editor, note.revision, note.contentMd, compositions, setRevision, hasPending, markConflict]);

  // Unsent text from an earlier session
  useEffect(() => {
    const draft = readDraft(note.id);
    if (!draft) return;
    editor.commands.setContent(draft.markdown, { contentType: 'markdown', emitUpdate: false });
    autosave.resumeDraft(draft);
    // Only when the editor first exists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const { flush } = autosave;
  useEffect(() => onWindowCloseFlush(flush), [flush]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const words = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      (current.storage.characterCount as { words: () => number }).words(),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-end gap-2 px-6">
        {autosave.gone ? (
          <span className="text-small text-danger" role="alert">
            {GONE_TEXT}
          </span>
        ) : autosave.status === 'failed' ? (
          <span className="text-small text-danger" role="alert">
            {STATUS_TEXT.failed}
          </span>
        ) : (
          // Saving and Saved are only for the eyes; a screen reader hears only the failure
          <span className="text-small text-fg-muted">{STATUS_TEXT[autosave.status]}</span>
        )}
        <RightPanelToggle />
      </div>
      {autosave.conflict ? (
        <div
          role="alert"
          className="mx-6 mb-2 flex shrink-0 items-center gap-3 rounded-control bg-input px-3 py-2"
        >
          <p className="flex-1 text-body text-fg">This note was changed on another device.</p>
          <Button
            variant="secondary"
            className="h-7 px-3"
            onClick={() => {
              void autosave.keepMine();
            }}
          >
            Keep mine
          </Button>
          <Button
            variant="secondary"
            className="h-7 px-3"
            onClick={() => {
              void autosave.takeTheirs();
            }}
          >
            Use theirs
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <TitleField
          note={note}
          readOnly={readOnly}
          onRenamed={async (title) => {
            // Save the text first, so the rename does not meet a half-saved note; the timers wait
            // until the rename is answered (the revision effect above follows its new revision)
            await autosave.flush();
            autosave.pause();
            try {
              const { item: renamed } = await rename.mutateAsync({ id: note.id, title });
              seenRevision.current = Math.max(seenRevision.current, renamed.revision);
              // The next save starts from the renamed revision, without waiting for the refetch
              autosave.setRevision(renamed.revision);
              setEditedAt(renamed.updatedAt);
            } finally {
              autosave.resume();
            }
          }}
          onEnter={() => editor.commands.focus('start')}
        />
        <EditorContent editor={editor} className="pb-6" />
      </div>
      <p className="shrink-0 px-6 py-2 text-small text-fg-muted">
        {words === 1 ? '1 word' : `${String(words)} words`} ·{' '}
        {editedLabel(note.updatedAt > editedAt ? note.updatedAt : editedAt, now)}
      </p>
    </div>
  );
}

interface TitleFieldProps {
  note: Note;
  readOnly: boolean;
  onRenamed: (title: string) => Promise<void>;
  onEnter: () => void;
}

/** The note title: 22 semibold, no border. Saved on blur or Enter; Escape puts the old one back. */
function TitleField({ note, readOnly, onRenamed, onEnter }: TitleFieldProps) {
  // A ref, so a blur right after Enter does not rename twice
  const saved = useRef(note.title);
  // The rename in flight: a blur while it is out (Enter, then a click into the text) joins it
  const pending = useRef<Promise<boolean> | null>(null);
  const [title, setTitle] = useState(note.title);
  const [error, setError] = useState<string | null>(null);

  /** True when the field holds a title the server has. */
  const commit = (): Promise<boolean> => {
    pending.current ??= run().finally(() => {
      pending.current = null;
    });
    return pending.current;
  };

  const run = async (): Promise<boolean> => {
    const next = title.trim();
    if (next === saved.current || next === '') {
      setTitle(saved.current);
      setError(null);
      return true;
    }
    try {
      await onRenamed(next);
      saved.current = next;
      setTitle(next);
      setError(null);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'note_title_taken') {
        setError('A note with this title exists.');
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Could not rename this note.');
      }
      return false;
    }
  };

  return (
    <div className="pb-2">
      <input
        value={title}
        readOnly={readOnly}
        aria-label="Title"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'note-title-error' : undefined}
        maxLength={200}
        onChange={(event) => {
          // [ ] | # would break links (memo D7)
          setTitle(event.target.value.replace(/[[\]|#]/g, ''));
          setError(null);
        }}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit().then((ok) => {
              if (ok) onEnter();
            });
          } else if (event.key === 'Escape') {
            setTitle(saved.current);
            setError(null);
          }
        }}
        className="w-full rounded-control bg-transparent py-1 text-page font-semibold text-fg focus-ring placeholder:text-fg-muted"
        placeholder="Untitled"
      />
      {error ? (
        <p id="note-title-error" role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
