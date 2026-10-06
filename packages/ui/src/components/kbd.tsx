import { cx } from '../lib/cx';

export interface KbdProps {
  /** Keys in order, e.g. ['Ctrl', 'K']. */
  keys: readonly string[];
  className?: string;
}

/** Keyboard shortcut hint such as "Ctrl K". */
export function Kbd({ keys, className }: KbdProps) {
  return (
    <span className={cx('inline-flex items-center gap-1', className)} aria-label={keys.join(' ')}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-chip border-[0.5px] border-glass-border bg-input px-1.5 font-sans text-small text-fg-muted"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
