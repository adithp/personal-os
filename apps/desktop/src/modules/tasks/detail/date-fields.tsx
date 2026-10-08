import { Button, Input, Switch } from '@personal-os/ui';
import { useState } from 'react';
import { fromIstDate, fromIstInput, toIstDate, toIstInput } from '../dates';
import { useDraft } from './use-draft';

/** The time an all-day task gets when All day is turned off (India time). */
export const DEFAULT_TIME = '09:00';

export interface DateTimeBoxProps {
  label: string;
  /** A date box (all-day) or a date and time box. */
  kind: 'date' | 'datetime';
  /** The saved time (UTC ISO) or null. */
  value: string | null;
  /** Called with the new UTC time when the box is left or Enter is pressed. */
  onCommit: (iso: string) => void;
}

/**
 * A date (and time) box in India time. While you type, the box keeps a draft (typing a year passes
 * through 0002, 0020, 0202 on the way to 2026); it is saved when you leave the box or press Enter.
 * An empty or half-typed value is ignored: use Clear to remove a date.
 */
export function DateTimeBox({ label, kind, value, onCommit }: DateTimeBoxProps) {
  const saved = kind === 'date' ? toIstDate(value) : toIstInput(value);
  const draft = useDraft(saved);

  const commit = () => {
    if (!draft.editing) return;
    const iso = kind === 'date' ? fromIstDate(draft.value) : fromIstInput(draft.value);
    if (!iso || draft.value === saved) {
      draft.discard();
      return;
    }
    onCommit(iso);
  };

  return (
    <Input
      type={kind === 'date' ? 'date' : 'datetime-local'}
      aria-label={label}
      value={draft.value}
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

export interface DueFieldsProps {
  dueAt: string | null;
  dueAllDay: boolean;
  onChange: (patch: { dueAt: string | null; dueAllDay: boolean }) => void;
}

/** The Due row: a date box (date-time, or date-only with All day on), the All day switch, Clear. */
export function DueFields({ dueAt, dueAllDay, onChange }: DueFieldsProps) {
  // With no date yet, the switch still decides what kind of box shows
  const [wantsAllDay, setWantsAllDay] = useState(false);
  const allDay = dueAt ? dueAllDay : wantsAllDay;

  const toggle = (next: boolean) => {
    if (!dueAt) {
      setWantsAllDay(next);
      return;
    }
    const date = toIstDate(dueAt);
    const iso = next ? fromIstDate(date) : fromIstInput(`${date}T${DEFAULT_TIME}`);
    if (iso) onChange({ dueAt: iso, dueAllDay: next });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <DateTimeBox
          label="Due"
          kind={allDay ? 'date' : 'datetime'}
          value={dueAt}
          onCommit={(iso) => {
            onChange({ dueAt: iso, dueAllDay: allDay });
          }}
        />
        {dueAt ? (
          <Button
            variant="secondary"
            aria-label="Clear due date"
            onClick={() => {
              setWantsAllDay(false);
              onChange({ dueAt: null, dueAllDay: false });
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Switch aria-label="All day" checked={allDay} onCheckedChange={toggle} />
        <span aria-hidden className="text-body text-fg-secondary">
          All day
        </span>
      </div>
    </div>
  );
}

export interface ReminderFieldProps {
  reminderAt: string | null;
  onChange: (reminderAt: string | null) => void;
}

/** The Reminder row: a date-time box and Clear. It only saves the date; nothing rings yet. */
export function ReminderField({ reminderAt, onChange }: ReminderFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <DateTimeBox label="Reminder" kind="datetime" value={reminderAt} onCommit={onChange} />
      {reminderAt ? (
        <Button
          variant="secondary"
          aria-label="Clear reminder"
          onClick={() => {
            onChange(null);
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
