import { lineDiff, type DiffLine } from '@personal-os/shared';
import { cx } from '@personal-os/ui';
import { useMemo } from 'react';

const SIGN = { add: '+', remove: '−', same: '' } as const;
const SPOKEN = { add: 'Added: ', remove: 'Removed: ', same: '' } as const;

/** At most this many rows are drawn; the rest is counted in a line below. */
export const MAX_DIFF_ROWS = 2000;
/** A run of unchanged lines longer than this is collapsed to its first and last two lines. */
const MAX_SAME_RUN = 6;
const KEEP_AT_EDGES = 2;

type Row = { line: DiffLine } | { hidden: number };

/** The diff as rows: long unchanged runs shrink to "… N unchanged lines". */
function toRows(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < lines.length;) {
    let end = i;
    while (end < lines.length && lines[end]?.type === 'same') end += 1;
    const run = end - i;
    if (run > MAX_SAME_RUN) {
      for (let k = i; k < i + KEEP_AT_EDGES; k += 1) rows.push({ line: lines[k] as DiffLine });
      rows.push({ hidden: run - 2 * KEEP_AT_EDGES });
      for (let k = end - KEEP_AT_EDGES; k < end; k += 1) rows.push({ line: lines[k] as DiffLine });
      i = end;
    } else if (run > 0) {
      for (let k = i; k < end; k += 1) rows.push({ line: lines[k] as DiffLine });
      i = end;
    } else {
      rows.push({ line: lines[i] as DiffLine });
      i += 1;
    }
  }
  return rows;
}

/**
 * The line diff of your current text against a version: a line that is only in the version (it
 * comes back on Restore) is tinted lavender with a "+", a line that is only in your current text
 * (Restore drops it) is struck through in the danger color with a "−". The sign and the screen
 * reader word say the same, so color is never the only signal.
 */
export function VersionDiff({ current, version }: { current: string; version: string }) {
  const { shown, more, empty } = useMemo(() => {
    const lines = lineDiff(current, version);
    const rows = toRows(lines);
    const left = rows.slice(MAX_DIFF_ROWS);
    return {
      shown: rows.slice(0, MAX_DIFF_ROWS),
      more: left.reduce((sum, row) => sum + ('hidden' in row ? row.hidden : 1), 0),
      empty: lines.length === 0,
    };
  }, [current, version]);
  return (
    <div role="group" aria-label="Changes compared with your current text" className="pb-6">
      {empty ? <p className="text-body text-fg-muted">Both texts are empty.</p> : null}
      {shown.map((row, index) =>
        'hidden' in row ? (
          // The same text can repeat; the position is what tells the rows apart
          <p key={index} data-diff="gap" className="px-2 text-small text-fg-muted">
            … {row.hidden} unchanged lines
          </p>
        ) : (
          <DiffRow key={index} line={row.line} />
        ),
      )}
      {more > 0 ? (
        <p className="px-2 pt-2 text-small text-fg-muted">{more} more lines not shown</p>
      ) : null}
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div
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
  );
}
