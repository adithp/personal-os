import { GlassCard, cx } from '@personal-os/ui';
import { useId, type ReactNode } from 'react';

export interface ReportCardProps {
  title: string;
  subtitle: string;
  /** True while the card shows its table instead of the chart. */
  table: boolean;
  onToggleTable: () => void;
  className?: string;
  children: ReactNode;
}

/** A glass card of the chart row: title, muted subtitle, and the "Show table" text button. */
export function ReportCard({
  title,
  subtitle,
  table,
  onToggleTable,
  className,
  children,
}: ReportCardProps) {
  const contentId = useId();
  return (
    <GlassCard
      role="region"
      aria-label={title}
      className={cx('flex min-h-[270px] min-w-0 flex-col gap-2', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-card font-medium text-fg">{title}</h2>
          <p className="text-small text-fg-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          aria-pressed={table}
          aria-controls={contentId}
          onClick={onToggleTable}
          className="min-h-6 min-w-6 rounded-chip px-2 py-1 text-small text-fg-secondary focus-ring transition-colors duration-150 ease-out hover:bg-input hover:text-fg"
        >
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {/* Same height for the chart and the table, so the row does not grow when they swap */}
      <div id={contentId} className="flex h-[200px] min-h-0 flex-col">
        {children}
      </div>
    </GlassCard>
  );
}

/** A plain table for the table view; scrolls inside the card when long. */
export function ReportTable({
  label,
  head,
  rows,
}: {
  label: string;
  head: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  return (
    <div
      role="region"
      aria-label={`${label} table`}
      tabIndex={0}
      className="h-full min-h-0 overflow-y-auto rounded-chip focus-ring"
    >
      <table aria-label={label} className="w-full text-left text-small text-fg-secondary">
        <thead>
          <tr>
            {head.map((name, index) => (
              <th
                key={name}
                scope="col"
                className={cx('py-1 font-medium text-fg-muted', index > 0 && 'text-right')}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])} className="border-t border-glass-border">
              {row.map((cell, index) => (
                <td key={head[index]} className={cx('py-1', index > 0 && 'text-right')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
