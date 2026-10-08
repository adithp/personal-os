import type { ComponentProps } from 'react';
import { cx } from '../lib/cx';

export interface GlassCardProps extends ComponentProps<'div'> {
  /** 12 px (compact) or 16 px (default) padding. */
  padding?: 'compact' | 'default' | 'none';
}

const paddings = { compact: 'p-3', default: 'p-4', none: '' } as const;

export function GlassCard({ padding = 'default', className, ...props }: GlassCardProps) {
  return <div className={cx('rounded-card glass', paddings[padding], className)} {...props} />;
}
