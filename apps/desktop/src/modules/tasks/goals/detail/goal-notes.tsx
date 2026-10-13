import { GOAL_DESCRIPTION_MAX } from '@personal-os/shared';
import { useLayoutEffect, useRef } from 'react';
import { useDraft } from '../../detail/use-draft';

/** Borderless notes that grow with the text and are saved when you leave the box (empty saves null). */
export function GoalNotes({
  description,
  onSave,
}: {
  description: string | null;
  onSave: (description: string | null) => void;
}) {
  const saved = description ?? '';
  const draft = useDraft(saved);
  const box = useRef<HTMLTextAreaElement>(null);

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
        draft.set(event.target.value);
      }}
      onBlur={() => {
        if (!draft.editing) return;
        const next = draft.value.trim() === '' ? null : draft.value;
        // Keep the draft on screen until the saved text arrives, so the old text never flashes back
        if ((next ?? '') === saved) draft.discard();
        else onSave(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
      }}
      className="min-h-11 w-full resize-none rounded-chip bg-transparent px-1 py-1 text-body text-fg focus-ring placeholder:text-fg-muted"
    />
  );
}
