import { GlassCard, cx } from '@personal-os/ui';
import type { ReactNode } from 'react';

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
          onClick={onToggleTable}
          className="rounded-chip px-2 py-1 text-small text-fg-secondary focus-ring transition-colors duration-150 ease-out hover:bg-input hover:text-fg"
        >
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {children}
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
    <div className="max-h-[220px] min-h-0 flex-1 overflow-y-auto">
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
