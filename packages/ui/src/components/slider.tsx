import { cx } from '../lib/cx';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** Accessible name. Use aria-labelledby instead when a visible label exists. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  disabled?: boolean;
  className?: string;
}

/** Range slider with a lavender handle. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  disabled,
  className,
  ...aria
}: SliderProps) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => {
        onValueChange(Number(event.target.value));
      }}
      className={cx(
        'h-5 w-40 cursor-pointer accent-accent focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...aria}
    />
  );
}
