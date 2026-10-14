import { GOAL_DESCRIPTION_MAX } from '@personal-os/shared';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useDraft } from '../../detail/use-draft';

/** Borderless notes that grow with the text and are saved when you leave the box (empty saves null). */
export function GoalNotes({
  description,
  onSave,
}: {
  description: string | null;
  /** `onFail` drops the typed text when the save failed. */
  onSave: (description: string | null, onFail: () => void) => void;
}) {
  const saved = description ?? '';
  const draft = useDraft(saved);
  const box = useRef<HTMLTextAreaElement>(null);

  // Text typed but not handed to onSave yet; saved when the page closes while still editing
  const unsaved = useRef<string | null>(null);
  const latest = useRef({ saved, onSave });
  useEffect(() => {
    latest.current = { saved, onSave };
  });
  useEffect(
    () => () => {
      const text = unsaved.current;
      if (text === null) return;
      const next = text.trim() === '' ? null : text;
      if ((next ?? '') !== latest.current.saved) latest.current.onSave(next, () => undefined);
    },
    [],
  );

  const save = () => {
    if (!draft.editing) return;
    unsaved.current = null;
    const next = draft.value.trim() === '' ? null : draft.value;
    // Keep the draft on screen until the saved text arrives, so the old text never flashes back
    if ((next ?? '') === saved) draft.discard();
    else onSave(next, draft.discard);
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${String(el.scrollHeight)}px`;
  }, [draft.value]);

  return (
    <textarea
      ref={box}
      aria-label="Notes"
      placeholder="Add notes…"
      rows={2}
      maxLength={GOAL_DESCRIPTION_MAX}
      value={draft.value}
      onChange={(event) => {
        unsaved.current = event.target.value;
        draft.set(event.target.value);
      }}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // Leaves the box and keeps the text, like blur
          event.stopPropagation();
          event.currentTarget.blur();
        }
      }}
      className="min-h-11 w-full resize-none rounded-chip bg-transparent px-1 py-1 text-body text-fg focus-ring placeholder:text-fg-muted"
    />
  );
}
