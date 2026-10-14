import { cx } from '../lib/cx';
import { clampPercent } from '../lib/percent';

export interface ProgressBarProps {
  /** Percent complete, 0–100. Values outside the range are clamped. */
  value: number;
  label: string;
  /** Spoken value, for example "3 of 8 tasks" (aria-valuetext). */
  valueText?: string;
  /** 'tile' (default): dark on dark, for tiles. 'glass': Tasks yellow on the same translucent dark track (visible on light glass), for glass cards. */
  tone?: 'tile' | 'glass';
  className?: string;
}

/** 5 px bar used on tiles: dark fill on a translucent dark track. */
export function ProgressBar({
  value,
  label,
  valueText,
  tone = 'tile',
  className,
}: ProgressBarProps) {
  const percent = clampPercent(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={valueText}
      className={cx('h-[5px] w-full overflow-hidden rounded-full bg-progress-track', className)}
    >
      <div
        className={cx(
          'h-full rounded-full',
          tone === 'glass' ? 'bg-module-tasks' : 'bg-progress-fill',
        )}
        style={{ width: `${String(percent)}%` }}
      />
    </div>
  );
}
