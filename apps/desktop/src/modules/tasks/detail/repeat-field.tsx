import {
  WEEKDAYS,
  WEEKDAY_NAMES,
  buildRecurrence,
  describeRecurrence,
  parseRecurrence,
  type Recurrence,
  type Weekday,
} from '@personal-os/shared';
import { Input, cx } from '@personal-os/ui';
import { IconChevronDown } from '@tabler/icons-react';
import { useId } from 'react';
import { istDay, toIstDate } from '../dates';
import { Popover, PopoverItem } from './popover';
import { useDraft } from './use-draft';

type Kind = 'none' | Recurrence['freq'];

const OPTIONS: readonly { kind: Kind; label: string }[] = [
  { kind: 'none', label: 'Does not repeat' },
  { kind: 'daily', label: 'Every day' },
  { kind: 'weekly', label: 'Every week' },
  { kind: 'monthly', label: 'Every month' },
  { kind: 'yearly', label: 'Every year' },
];

/** The weekday of the India calendar day of a time (1 Jan 1970 was a Thursday). */
function istWeekday(iso: string): Weekday {
  return WEEKDAYS[(istDay(Date.parse(iso)) + 3) % 7] ?? 'MO';
}

/** The day of the month in India time. */
const istMonthDay = (iso: string) => Number(toIstDate(iso).slice(8, 10));

export interface RepeatFieldProps {
  dueAt: string | null;
  recurrenceRule: string | null;
  /** Called with the new rule text, or null for Does not repeat. */
  onChange: (recurrenceRule: string | null) => void;
}

function MonthDayBox({ day, onCommit }: { day: number; onCommit: (day: number) => void }) {
  const draft = useDraft(String(day));
  const commit = () => {
    if (!draft.editing) return;
    const next = Number(draft.value);
    if (!Number.isInteger(next) || next < 1 || next > 31 || next === day) {
      draft.discard();
      return;
    }
    onCommit(next);
  };
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="text-body text-fg-secondary">
        On day
      </span>
      <Input
        type="number"
        min={1}
        max={31}
        aria-label="Day of the month"
        className="w-20"
        value={draft.value}
        onChange={(event) => {
          draft.set(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </div>
  );
}

/**
 * The Repeat row: a menu of presets (no free-text rule). Choosing saves at once. A repeating task
 * needs a due date, so the menu is off without one. A rule that is not a preset is shown as text.
 */
export function RepeatField({ dueAt, recurrenceRule, onChange }: RepeatFieldProps) {
  const current = recurrenceRule ? parseRecurrence(recurrenceRule) : null;
  const hintId = useId();
  const keepId = useId();
  // A rule that is not a preset keeps the menu, so Does not repeat and the presets stay reachable
  const custom = Boolean(recurrenceRule && !current);

  const kind: Kind = current?.freq ?? 'none';
  const summary = recurrenceRule ? describeRecurrence(recurrenceRule) : 'Does not repeat';
  const disabled = !dueAt && !recurrenceRule;

  const choose = (next: Kind) => {
    if (next === kind && !custom) return;
    if (next === 'none') {
      onChange(null);
      return;
    }
    if (!dueAt) return;
    const preset: Recurrence =
      next === 'weekly'
        ? { freq: 'weekly', days: [istWeekday(dueAt)] }
        : next === 'monthly'
          ? { freq: 'monthly', day: istMonthDay(dueAt) }
          : { freq: next };
    onChange(buildRecurrence(preset));
  };

  const toggleDay = (days: Weekday[], day: Weekday) => {
    const next = days.includes(day) ? days.filter((other) => other !== day) : [...days, day];
    // At least one day stays on
    if (next.length > 0) onChange(buildRecurrence({ freq: 'weekly', days: next }));
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover
        label={`Repeat: ${summary}`}
        popupLabel="Repeat options"
        disabled={disabled}
        describedBy={disabled ? hintId : undefined}
        triggerClassName="inline-flex h-8 items-center gap-2 rounded-[10px] bg-input px-3 text-body text-fg hover:bg-glass disabled:opacity-50"
        trigger={
          <>
            <span aria-hidden className="truncate">
              {summary}
            </span>
            <IconChevronDown size={14} aria-hidden className="shrink-0 text-fg-muted" />
          </>
        }
      >
        {(close) => (
          <>
            {OPTIONS.map((option) => (
              <PopoverItem
                key={option.kind}
                role="menuitemradio"
                checked={option.kind === kind}
                onSelect={() => {
                  choose(option.kind);
                  close();
                }}
              >
                {option.label}
              </PopoverItem>
            ))}
          </>
        )}
      </Popover>
      {custom ? <p className="text-small text-fg-muted">Custom rule</p> : null}
      {disabled ? (
        <p id={hintId} className="text-small text-fg-muted">
          Set a due date to repeat
        </p>
      ) : null}
      {current?.freq === 'weekly' ? (
        <div role="group" aria-label="Repeat on" className="flex flex-wrap gap-1">
          {WEEKDAYS.map((day) => {
            const on = current.days.includes(day);
            const last = on && current.days.length === 1;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-disabled={last ? true : undefined}
                aria-describedby={last ? keepId : undefined}
                onClick={() => {
                  toggleDay(current.days, day);
                }}
                className={cx(
                  'h-6 rounded-[8px] px-2 text-small focus-ring',
                  on ? 'bg-accent text-on-tile' : 'bg-input text-fg-secondary hover:text-fg',
                )}
              >
                {WEEKDAY_NAMES[day]}
              </button>
            );
          })}
        </div>
      ) : null}
      {current?.freq === 'weekly' && current.days.length === 1 ? (
        <p id={keepId} className="text-small text-fg-muted">
          Keep at least one day
        </p>
      ) : null}
      {current?.freq === 'monthly' ? (
        <MonthDayBox
          day={current.day}
          onCommit={(day) => {
            onChange(buildRecurrence({ freq: 'monthly', day }));
          }}
        />
      ) : null}
    </div>
  );
}
