import { cx } from '../lib/cx';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name. Use aria-labelledby instead when a visible label exists. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  disabled?: boolean;
  className?: string;
}

/** On/off switch. On is lavender. */
export function Switch({ checked, onCheckedChange, disabled, className, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onCheckedChange(!checked);
      }}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-[0.5px] border-glass-border focus-ring transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-input',
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden
        className={cx(
          'size-4 rounded-full shadow-none transition-transform duration-150 ease-out',
          checked ? 'translate-x-[18px] bg-on-tile' : 'translate-x-0.5 bg-fg-secondary',
        )}
      />
    </button>
  );
}
