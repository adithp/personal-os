import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { createNoteExtensions } from '../editor/extensions';
import '../editor/note-editor.css';
import { serializeNote } from '../editor/serialize';
import { useTemplateActions } from '../templates-queries';

/** Wait this long after the last key before saving. */
export const TEMPLATE_SAVE_DELAY_MS = 800;

/**
 * Template text uses the note editor's extensions without the wikilink node, so `[[x]]` stays plain
 * text (templates are not parsed for links or tags, memo notes.md D11).
 */
const extensions = () =>
  createNoteExtensions().filter((extension) => extension.name !== 'wikiLink');

type Status = 'saved' | 'saving' | 'failed';

/**
 * The editor for one template's text. Create it with `key={template.id}` so each template gets a
 * fresh editor. Saves 0.8 s after the last change, when the editor loses focus, and on unmount.
 */
export function TemplateBody({ id, contentMd }: { id: string; contentMd: string }) {
  const { update } = useTemplateActions();
  const [status, setStatus] = useState<Status>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const saved = useRef(contentMd);
  const mutate = useRef(update.mutate);
  useEffect(() => {
    mutate.current = update.mutate;
  });

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = pending.current;
    pending.current = null;
    if (text === null || text === saved.current) return;
    setStatus('saving');
    mutate.current(
      { id, contentMd: text },
      {
        onSuccess: () => {
          saved.current = text;
          setStatus('saved');
        },
        onError: () => {
          pending.current ??= text;
          setStatus('failed');
        },
      },
    );
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  const editor = useEditor({
    extensions: extensions(),
    content: contentMd,
    contentType: 'markdown',
    editorProps: { attributes: { class: 'note-editor', 'aria-label': 'Template text' } },
    onUpdate: ({ editor: current }) => {
      pending.current = serializeNote(current);
      setStatus('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        flushRef.current();
      }, TEMPLATE_SAVE_DELAY_MS);
    },
    onBlur: () => {
      flushRef.current();
    },
  });

  // Leaving the template saves what is left
  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <EditorContent editor={editor} className="pb-6" />
      </div>
      <div className="flex items-center justify-between gap-3 text-small text-fg-muted">
        <p>{'Variables: {{title}}, {{date}}, {{time}}'}</p>
        {status === 'failed' ? (
          <button
            type="button"
            role="alert"
            onClick={flush}
            className="rounded-chip text-danger underline focus-ring"
          >
            Could not save. Try again
          </button>
        ) : (
          <p>{status === 'saving' ? 'Saving…' : 'Saved'}</p>
        )}
      </div>
    </div>
  );
}
