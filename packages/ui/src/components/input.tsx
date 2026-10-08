import type { ComponentProps } from 'react';
import { cx } from '../lib/cx';

/** Text input on a faint glass background (DESIGN.md section 6). */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cx(
        'h-[34px] w-full rounded-control border-[0.5px] border-transparent bg-input px-3 text-body text-fg liquid-input',
        'focus-ring transition-colors duration-150 ease-out focus-visible:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
}
