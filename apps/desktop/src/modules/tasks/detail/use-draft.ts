import { useState } from 'react';

/**
 * Text being typed into a box. It shows the draft while the saved value is still the one the draft
 * started from, and the saved value as soon as that changes (after a save, or a change made
 * elsewhere), so a box never needs an effect to stay in step.
 */
export function useDraft(saved: string) {
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
  const value = draft?.base === saved ? draft.value : saved;
  return {
    value,
    /** True while the box holds text that is not saved yet. */
    editing: draft !== null && draft.base === saved,
    set: (next: string) => {
      setDraft({ base: saved, value: next });
    },
    discard: () => {
      setDraft(null);
    },
  };
}
