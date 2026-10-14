import type { Note } from '@personal-os/shared';
import { Button } from '@personal-os/ui';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { useNote, useRenameNote, useUpdateNote } from '../notes-queries';
import { editedLabel } from './edited-label';
import { createNoteExtensions } from './extensions';
import './note-editor.css';
import { serializeNote } from './serialize';
import { readDraft, useAutosave, type SaveFn, type SaveStatus } from './use-autosave';
import { onWindowCloseFlush } from './window-close';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  failed: 'Not saved, retrying',
};

/** Loads one note and shows the editor for it. */
export function NoteEditorPane({ noteId }: { noteId: string }) {
  const query = useNote(noteId);
  if (query.isPending) {
    return (
      <div className="p-6 text-body text-fg-muted" role="status">
        Loading note…
      </div>
    );
  }
  if (query.isError) {
    return (
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
    );
  }
  // One editor per note: switching notes unmounts this one, which saves its text first
  return <NoteEditor key={noteId} note={query.data} refetch={query.refetch} />;
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

  const save: SaveFn = async (markdown, baseRevision, options) => {
    try {
      const saved = await update.mutateAsync({
        id: note.id,
        baseRevision,
        contentMd: markdown,
        ...(options?.force ? { force: true } : {}),
      });
      setEditedAt(saved.updatedAt);
      return { revision: saved.revision };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'note_conflict') {
        return { conflict: true };
      }
      throw error;
    }
  };

  const autosave = useAutosave({
    noteId: note.id,
    baseRevision: note.revision,
    save,
    onTakeTheirs: () => {
      void refetch().then((result) => {
        const theirs = result.data;
        if (!theirs) return;
        editorRef.current?.commands.setContent(theirs.contentMd, {
          contentType: 'markdown',
          emitUpdate: false,
        });
        autosave.setRevision(theirs.revision);
        setEditedAt(theirs.updatedAt);
      });
    },
  });

  const editor = useEditor({
    extensions: createNoteExtensions(),
    content: note.contentMd,
    contentType: 'markdown',
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
    <section className="flex h-full min-h-0 flex-col" aria-label="Note editor">
      <div className="flex h-10 shrink-0 items-center justify-end px-6">
        <span
          className={
            autosave.status === 'failed' ? 'text-small text-danger' : 'text-small text-fg-muted'
          }
          role="status"
          aria-live="polite"
        >
          {STATUS_TEXT[autosave.status]}
        </span>
      </div>
      {autosave.conflict ? (
        <div
          role="alert"
          className="mx-6 mb-2 flex shrink-0 items-center gap-3 rounded-control glass px-3 py-2"
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
          <Button variant="secondary" className="h-7 px-3" onClick={autosave.takeTheirs}>
            Use theirs
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <TitleField
          note={note}
          onRenamed={async (title) => {
            // Save the text first, so the rename does not meet a half-saved note
            await autosave.flush();
            const { item: renamed } = await rename.mutateAsync({ id: note.id, title });
            autosave.setRevision(renamed.revision);
            setEditedAt(renamed.updatedAt);
          }}
          onEnter={() => editor.commands.focus('start')}
        />
        <EditorContent editor={editor} className="pb-6" />
      </div>
      <p className="shrink-0 px-6 py-2 text-small text-fg-muted">
        {words === 1 ? '1 word' : `${String(words)} words`} · {editedLabel(editedAt, now)}
      </p>
    </section>
  );
}

interface TitleFieldProps {
  note: Note;
  onRenamed: (title: string) => Promise<void>;
  onEnter: () => void;
}

/** The note title: 22 semibold, no border. Saved on blur or Enter; Escape puts the old one back. */
function TitleField({ note, onRenamed, onEnter }: TitleFieldProps) {
  // A ref, so a blur right after Enter does not rename twice
  const saved = useRef(note.title);
  const [title, setTitle] = useState(note.title);
  const [error, setError] = useState<string | null>(null);

  /** True when the field holds a title the server has. */
  const commit = async (): Promise<boolean> => {
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
