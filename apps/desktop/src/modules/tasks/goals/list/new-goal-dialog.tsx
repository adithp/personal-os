import { GOAL_TITLE_MAX } from '@personal-os/shared';
import { Button, Input } from '@personal-os/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { DateTimeBox } from '../../detail/date-fields';
import { trapTab } from '../../inbox/trap-tab';

export interface NewGoalDialogProps {
  /** Creates the goal. Rejects when the server refused (the dialog then stays open). */
  onCreate: (input: { title: string; targetAt?: string }) => Promise<void>;
  onClose: () => void;
}

/** "New goal": a title and an optional target date. Enter in the title creates; Escape closes. */
export function NewGoalDialog({ onCreate, onClose }: NewGoalDialogProps) {
  const box = useRef<HTMLDivElement>(null);
  const titleBox = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [targetAt, setTargetAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const before = document.activeElement;
    titleBox.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before !== document.body) before.focus();
    };
  }, []);

  const submit = async () => {
    if (busy) return;
    if (title.trim() === '') {
      setError('Add a title');
      titleBox.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onCreate({ title: title.trim(), ...(targetAt ? { targetAt } : {}) });
    } catch {
      // The hook already showed the server's message in a toast; keep the dialog open
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    trapTab(event, box.current);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="New goal"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-[400px] max-w-[90vw] flex-col gap-4 rounded-card glass-strong p-4 outline-none"
      >
        <h2 className="text-section font-semibold text-fg">New goal</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-goal-title" className="text-small font-medium text-fg-muted">
            Title
          </label>
          <Input
            id="new-goal-title"
            ref={titleBox}
            value={title}
            maxLength={GOAL_TITLE_MAX}
            aria-invalid={error !== null}
            aria-describedby={error ? 'new-goal-error' : undefined}
            placeholder="What do you want to achieve?"
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {error ? (
            <p id="new-goal-error" role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-fg-muted">Target date (optional)</span>
          <div className="flex items-center gap-2">
            <DateTimeBox label="Target date" kind="date" value={targetAt} onCommit={setTargetAt} />
            {targetAt ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setTargetAt(null);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void submit();
            }}
          >
            Create goal
          </Button>
        </div>
      </div>
    </div>
  );
}
