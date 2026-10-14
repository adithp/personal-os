import { DEFAULT_CATEGORIES } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import type { ReactNode } from 'react';

/** A label above one control. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-fg-muted">{label}</span>
        {children}
      </label>
      {hint ? <span className="text-small text-fg-muted">{hint}</span> : null}
    </div>
  );
}

/** Same look as the Input of packages/ui, for a native select. */
export const selectClass =
  'h-[34px] w-full rounded-control border-[0.5px] border-transparent bg-input px-3 text-body text-fg ' +
  'focus-ring transition-colors duration-150 ease-out focus-visible:border-accent';

/** The colors a user can pick for wallets, categories, goals and subscriptions. */
export const SWATCHES: readonly string[] = [
  ...new Set(DEFAULT_CATEGORIES.map((category) => category.color)),
];

/** A small round color dot (the color is data the user chose, so it is set inline). */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
    />
  );
}

/** Pick one color out of the swatches. */
export function ColorPicker({
  value,
  onChange,
  label = 'Color',
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-small font-medium text-fg-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === color.toLowerCase()}
            aria-label={color}
            onClick={() => {
              onChange(color);
            }}
            className={cx(
              'size-6 rounded-full focus-ring',
              value.toLowerCase() === color.toLowerCase() && 'ring-2 ring-accent ring-offset-1',
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}
