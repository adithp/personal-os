import { cx } from '../lib/cx';
import { clampPercent } from '../lib/percent';

export interface ProgressBarProps {
  /** Percent complete, 0–100. Values outside the range are clamped. */
  value: number;
  label: string;
  /** 'tile' (default): dark on dark, for tiles. 'glass': Tasks yellow on the input color, for glass cards. */
  tone?: 'tile' | 'glass';
  className?: string;
}

/** 5 px bar used on tiles: dark fill on a translucent dark track. */
export function ProgressBar({ value, label, tone = 'tile', className }: ProgressBarProps) {
  const percent = clampPercent(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className={cx(
        'h-[5px] w-full overflow-hidden rounded-full',
        tone === 'glass' ? 'bg-input' : 'bg-progress-track',
        className,
      )}
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
