import { TASK_DESCRIPTION_MAX, TASK_TITLE_MAX } from '@personal-os/shared';
import { Input } from '@personal-os/ui';
import { useDraft } from './use-draft';

export interface TitleFieldProps {
  title: string;
  onSave: (title: string) => void;
}

/** The title box: saved on blur or Enter; an empty title puts the old one back. */
export function TitleField({ title, onSave }: TitleFieldProps) {
  const draft = useDraft(title);

  const commit = () => {
    if (!draft.editing) return;
    const next = draft.value.trim();
    if (next === '' || next === title) {
      draft.discard();
      return;
    }
    onSave(next);
  };

  return (
    <Input
      aria-label="Title"
      value={draft.value}
      maxLength={TASK_TITLE_MAX}
      className="text-section font-medium"
      onChange={(event) => {
        draft.set(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export interface NotesFieldProps {
  description: string | null;
  onSave: (description: string | null) => void;
}

/** The notes box: saved on blur; empty saves nothing (null). */
export function NotesField({ description, onSave }: NotesFieldProps) {
  const draft = useDraft(description ?? '');

  const commit = () => {
    if (!draft.editing) return;
    const next = draft.value.trim();
    if (next === (description ?? '')) {
      draft.discard();
      return;
    }
    onSave(next === '' ? null : next);
  };

  return (
    <textarea
      aria-label="Notes"
      rows={4}
      maxLength={TASK_DESCRIPTION_MAX}
      placeholder="Add notes"
      value={draft.value}
      onChange={(event) => {
        draft.set(event.target.value);
      }}
      onBlur={commit}
      className="w-full resize-none rounded-control border-[0.5px] border-transparent bg-input px-3 py-2 text-body text-fg liquid-input focus-ring transition-colors duration-150 ease-out focus-visible:border-accent"
    />
  );
}
