import { Button, Input } from '@personal-os/ui';
import { useEffect, useRef, useState, type SyntheticEvent, type KeyboardEvent } from 'react';
import { tomorrowOf } from './drop-plan';

export interface DropDatePickerProps {
  /** The task being moved, for the name of the popup. */
  title: string;
  now: Date;
  /** Where the task was dropped (screen position); the popup opens just below it. */
  anchor: { left: number; top: number };
  /** Called with the chosen day, "2025-10-12" (an India calendar day after today). */
  onPick: (date: string) => void;
  onCancel: () => void;
}

const WIDTH = 260;
const HEIGHT = 170;
const MARGIN = 8;

/**
 * A small glass popup that asks for a due date when a task is dropped on Upcoming. The day must be
 * after today (India). Enter or Move confirms; Esc or Cancel sends nothing, so the task stays where
 * it was. Focus goes to the date box, and returns to where it was when the popup closes.
 */
export function DropDatePicker({ title, now, anchor, onPick, onCancel }: DropDatePickerProps) {
  const earliest = tomorrowOf(now);
  const [date, setDate] = useState(earliest);
  const box = useRef<HTMLInputElement>(null);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= earliest;

  useEffect(() => {
    const before = document.activeElement;
    box.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before !== document.body) before.focus();
    };
  }, []);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (valid) onPick(date);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(anchor.top, window.innerHeight - HEIGHT - MARGIN));
  return (
    <div
      className="fixed inset-0 z-40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-label={`Move to Upcoming: ${title}`}
        onSubmit={submit}
        onKeyDown={onKeyDown}
        style={{ left, top, width: WIDTH }}
        className="fixed flex flex-col gap-3 rounded-card border-[0.5px] border-glass-border glass-strong p-3"
      >
        <label className="flex flex-col gap-1.5 text-small text-fg-muted">
          Due date
          <Input
            ref={box}
            type="date"
            min={earliest}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
            }}
          />
        </label>
        {valid ? null : <p className="text-small text-fg-muted">Pick a day after today.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Move
          </Button>
        </div>
      </form>
    </div>
  );
}
