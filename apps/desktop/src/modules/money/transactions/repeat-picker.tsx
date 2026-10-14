import {
  WEEKDAYS,
  WEEKDAY_NAMES,
  buildRecurrence,
  type Weekday,
} from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { Field, selectClass } from '../ui/fields';

export type RepeatKind = 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatChoice {
  kind: RepeatKind;
  /** For weekly: the chosen weekdays. */
  days: Weekday[];
}

const OPTIONS: readonly { value: RepeatKind; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week on…' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
];

const WEEKDAY_OF_NUMBER: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** The weekday of a day string (YYYY-MM-DD). */
export function weekdayOf(day: string): Weekday {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return WEEKDAY_OF_NUMBER[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? 'MO';
}

/** The repeat rule text of a choice for a first day; null for "never" (or weekly with no day). */
export function ruleOf(choice: RepeatChoice, firstDay: string): string | null {
  switch (choice.kind) {
    case 'never':
      return null;
    case 'daily':
      return buildRecurrence({ freq: 'daily' });
    case 'weekly':
      return choice.days.length > 0 ? buildRecurrence({ freq: 'weekly', days: choice.days }) : null;
    case 'monthly':
      return buildRecurrence({ freq: 'monthly', day: Number(firstDay.slice(8, 10)) });
    case 'yearly':
      return buildRecurrence({ freq: 'yearly' });
  }
}

/** "Repeat" select with the presets; weekly shows the weekday buttons. */
export function RepeatPicker({
  value,
  firstDay,
  onChange,
}: {
  value: RepeatChoice;
  firstDay: string;
  onChange: (value: RepeatChoice) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field label="Repeat">
        <select
          className={selectClass}
          value={value.kind}
          onChange={(event) => {
            const kind = event.target.value as RepeatKind;
            onChange({
              kind,
              days: value.days.length > 0 ? value.days : [weekdayOf(firstDay)],
            });
          }}
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      {value.kind === 'weekly' ? (
        <div role="group" aria-label="Repeat on" className="flex flex-wrap gap-1">
          {WEEKDAYS.map((day) => {
            const on = value.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onChange({
                    ...value,
                    days: on ? value.days.filter((item) => item !== day) : [...value.days, day],
                  });
                }}
                className={cx(
                  'h-7 rounded-chip px-2 text-small font-medium focus-ring',
                  on ? 'bg-accent text-on-tile' : 'bg-input text-fg-secondary hover:text-fg',
                )}
              >
                {WEEKDAY_NAMES[day]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
