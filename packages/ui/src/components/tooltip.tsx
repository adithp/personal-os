import type { ReactElement } from 'react';
import { cloneElement, useId, useState } from 'react';

export interface TooltipProps {
  label: string;
  /** One focusable element, e.g. a button. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

/** Small label shown above an element on hover or keyboard focus. Escape hides it. */
export function Tooltip({ label, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocus={() => {
        setOpen(true);
      }}
      onBlur={() => {
        setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      {cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-chip glass-strong px-2 py-1 text-small whitespace-nowrap text-fg"
        >
          {label}
        </span>
      )}
    </span>
  );
}
