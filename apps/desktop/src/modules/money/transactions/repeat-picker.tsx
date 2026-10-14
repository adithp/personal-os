import { WEEKDAYS, WEEKDAY_NAMES } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { selectClass } from '../ui/field-styles';
import { Field } from '../ui/fields';
import { weekdayOf, type RepeatChoice, type RepeatKind } from './repeat-rule';

const OPTIONS: readonly { value: RepeatKind; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week on…' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
];

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
