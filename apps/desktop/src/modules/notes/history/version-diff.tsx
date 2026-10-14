import { lineDiff } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { useMemo } from 'react';

const SIGN = { add: '+', remove: '−', same: '' } as const;
const SPOKEN = { add: 'Added: ', remove: 'Removed: ', same: '' } as const;

/**
 * The line diff of your current text against a version: a line that is only in the version (it
 * comes back on Restore) is tinted lavender with a "+", a line that is only in your current text
 * (Restore drops it) is struck through in the danger color with a "−". The sign and the screen
 * reader word say the same, so color is never the only signal.
 */
export function VersionDiff({ current, version }: { current: string; version: string }) {
  const lines = useMemo(() => lineDiff(current, version), [current, version]);
  return (
    <div role="group" aria-label="Changes compared with your current text" className="pb-6">
      {lines.length === 0 ? <p className="text-body text-fg-muted">Both texts are empty.</p> : null}
      {lines.map((line, index) => (
        <div
          // The same text can repeat; the position is what tells the lines apart
          key={index}
          data-diff={line.type}
          className={cx(
            'flex gap-2 rounded-chip px-2 text-body',
            line.type === 'add' && 'bg-accent/20 text-fg',
            line.type === 'remove' && 'text-danger line-through',
            line.type === 'same' && 'text-fg-secondary',
          )}
        >
          <span aria-hidden="true" className="w-3 shrink-0 text-center select-none">
            {SIGN[line.type]}
          </span>
          <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
            <span className="sr-only">{SPOKEN[line.type]}</span>
            {line.text === '' ? ' ' : line.text}
          </span>
        </div>
      ))}
    </div>
  );
}
