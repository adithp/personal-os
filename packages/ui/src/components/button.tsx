import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: 'primary' | 'secondary';
}

const base =
  'focus-ring inline-flex h-[34px] items-center justify-center gap-2 rounded-control px-4 text-body font-medium ' +
  'transition-[filter,background-color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50';

const variants = {
  primary: 'bg-accent text-on-tile enabled:hover:brightness-105',
  secondary: 'glass text-fg enabled:hover:bg-input',
} as const;

/** Primary (lavender) or secondary (glass) button. */
export function Button({ variant = 'primary', type = 'button', className, ...props }: ButtonProps) {
  return <button type={type} className={cx(base, variants[variant], className)} {...props} />;
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Required: icon buttons have no visible text. */
  'aria-label': string;
  icon: ReactNode;
}

/** 30×30 glass button holding one icon. */
export function IconButton({ icon, type = 'button', className, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex size-[30px] items-center justify-center rounded-control glass text-fg focus-ring',
        'transition-colors duration-150 ease-out enabled:hover:bg-input disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
