import { clampPercent, cx } from '@personal-os/ui';

/** A 5 px progress bar in the Money mint (danger red when `over`), for glass cards. */
export function MoneyBar({
  value,
  label,
  valueText,
  over = false,
  color,
}: {
  /** Percent, 0 to 100 (more is clamped). */
  value: number;
  label: string;
  valueText?: string;
  over?: boolean;
  /** A user-chosen color (a goal's), instead of the mint. */
  color?: string;
}) {
  const percent = clampPercent(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={valueText}
      className="h-[5px] w-full overflow-hidden rounded-full bg-progress-track"
    >
      <div
        className={cx('h-full rounded-full', over ? 'bg-danger' : color ? '' : 'bg-module-money')}
        style={{
          width: `${String(percent)}%`,
          ...(color && !over ? { backgroundColor: color } : {}),
        }}
      />
    </div>
  );
}
