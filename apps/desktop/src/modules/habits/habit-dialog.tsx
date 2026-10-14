import {
  HABIT_CATEGORY_MAX,
  HABIT_NAME_MAX,
  HABIT_NOTES_MAX,
  HABIT_WEEKDAY_NAMES,
  TAG_PALETTE,
  type Habit,
} from '@personal-os/shared';
import { Button, Input, SegmentedControl, cx } from '@personal-os/ui';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { colorName } from '../tasks/manage-tags/swatches';
import { trapTab } from '../tasks/inbox/trap-tab';
import { EMPTY_FORM, formOf, readForm, type HabitFields, type HabitForm } from './habit-form';

const SCHEDULES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Every N days' },
] as const;

export interface HabitDialogProps {
  /** The habit to edit; none creates a new one. */
  habit?: Habit;
  /** Categories already in use, offered as suggestions. */
  categories: readonly string[];
  /** Saves. Rejects when the server refused (the dialog then stays open). */
  onSave: (fields: HabitFields) => Promise<void>;
  /** Edit only: archive the habit. */
  onArchive?: () => void;
  onClose: () => void;
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-fg-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Create or edit a habit. Enter in the name saves; Escape closes. */
export function HabitDialog({ habit, categories, onSave, onArchive, onClose }: HabitDialogProps) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<HabitForm>(() => (habit ? formOf(habit) : EMPTY_FORM));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = habit !== undefined;

  useEffect(() => {
    const before = document.activeElement;
    nameBox.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before !== document.body) before.focus();
    };
  }, []);

  const set = <K extends keyof HabitForm>(key: K, value: HabitForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submit = async () => {
    if (busy) return;
    const result = readForm(form);
    if ('error' in result) {
      setError(result.error);
      if (form.name.trim() === '') nameBox.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSave(result.fields);
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

  const toggleDay = (day: number) => {
    set('days', form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day]);
  };

  const heading = editing ? 'Edit habit' : 'New habit';

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex max-h-[90vh] w-[440px] max-w-[90vw] flex-col gap-4 overflow-y-auto rounded-card glass-strong p-4 outline-none"
      >
        <h2 id={`${uid}-heading`} className="text-section font-semibold text-fg">
          {heading}
        </h2>

        <Field id={`${uid}-name`} label="Name">
          <Input
            id={`${uid}-name`}
            ref={nameBox}
            value={form.name}
            maxLength={HABIT_NAME_MAX}
            aria-invalid={error !== null && form.name.trim() === ''}
            placeholder="What do you want to do?"
            onChange={(event) => {
              set('name', event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </Field>

        <Field id={`${uid}-category`} label="Category (optional)">
          <Input
            id={`${uid}-category`}
            list={`${uid}-categories`}
            value={form.category}
            maxLength={HABIT_CATEGORY_MAX}
            placeholder="Health, Learning, …"
            onChange={(event) => {
              set('category', event.target.value);
            }}
          />
          <datalist id={`${uid}-categories`}>
            {categories.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-fg-muted">Schedule</span>
          <SegmentedControl
            label="Schedule"
            value={form.scheduleType}
            options={SCHEDULES}
            onChange={(value) => {
              set('scheduleType', value);
            }}
          />
          {form.scheduleType === 'weekly' ? (
            <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-1.5">
              {HABIT_WEEKDAY_NAMES.map((name, index) => {
                const day = index + 1;
                const on = form.days.includes(day);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      toggleDay(day);
                    }}
                    className={cx(
                      'h-7 min-w-10 rounded-chip px-2 text-body font-medium focus-ring transition-colors duration-150 ease-out',
                      on ? 'bg-accent text-on-tile' : 'bg-input text-fg-secondary hover:text-fg',
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : null}
          {form.scheduleType === 'custom' ? (
            <div className="flex items-center gap-2">
              <span className="text-body text-fg-secondary">Every</span>
              <Input
                type="number"
                aria-label="Every N days"
                min={2}
                className="w-20"
                value={form.everyDays}
                onChange={(event) => {
                  set('everyDays', event.target.value);
                }}
              />
              <span className="text-body text-fg-secondary">days</span>
            </div>
          ) : null}
        </div>

        <Field id={`${uid}-target`} label="Target per day">
          <Input
            id={`${uid}-target`}
            type="number"
            min={1}
            className="w-24"
            value={form.target}
            onChange={(event) => {
              set('target', event.target.value);
            }}
          />
          <p className="text-small text-fg-muted">
            1 is a simple check. More makes a counter, such as 8 glasses of water.
          </p>
        </Field>

        <Field id={`${uid}-reminder`} label="Reminder time (optional)">
          <div className="flex items-center gap-2">
            <Input
              id={`${uid}-reminder`}
              type="time"
              className="w-32"
              value={form.reminderTime}
              onChange={(event) => {
                set('reminderTime', event.target.value);
              }}
            />
            {form.reminderTime !== '' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  set('reminderTime', '');
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <p className="text-small text-fg-muted">
            Saved with the habit only. Reminders are not sent yet.
          </p>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span id={`${uid}-color`} className="text-small font-medium text-fg-muted">
            Color
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`${uid}-color`}
            className="flex flex-wrap items-center gap-2"
          >
            {[null, ...TAG_PALETTE].map((color) => {
              const checked = form.color === color;
              const label = color === null ? 'Default' : colorName(color);
              return (
                <button
                  key={color ?? 'default'}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    set('color', color);
                  }}
                  className={cx(
                    'flex size-6 items-center justify-center rounded-full border-[1.5px] text-on-tile focus-ring',
                    checked ? 'border-fg' : 'border-transparent',
                  )}
                  style={{ backgroundColor: color ?? 'var(--module-habits)' }}
                >
                  {checked ? <IconCheck size={12} stroke={2.5} aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <Field id={`${uid}-notes`} label="Notes (optional)">
          <textarea
            id={`${uid}-notes`}
            rows={3}
            maxLength={HABIT_NOTES_MAX}
            value={form.notes}
            onChange={(event) => {
              set('notes', event.target.value);
            }}
            className="w-full resize-y rounded-control border-[0.5px] border-transparent bg-input px-3 py-2 text-body text-fg focus-ring focus-visible:border-accent"
          />
        </Field>

        <p role="alert" className="min-h-[15px] text-small text-danger">
          {error}
        </p>

        <div className="flex items-center justify-between gap-2">
          <div>
            {editing && onArchive ? (
              <Button variant="secondary" onClick={onArchive}>
                Archive
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void submit();
              }}
            >
              {editing ? 'Save' : 'Create habit'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
