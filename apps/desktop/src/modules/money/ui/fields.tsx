import { cx } from '@personal-os/ui';
import type { ReactNode } from 'react';
import { SWATCHES } from './field-styles';

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
