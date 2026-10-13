import type { TaskReport } from '@personal-os/shared';
import { useState } from 'react';
import { ReportCard, ReportTable } from './report-card';
import { periodWord } from './report-format';

interface TagRow {
  key: string;
  name: string;
  done: number;
  /** The tag's own pastel color; null for the two summary rows. */
  color: string | null;
}

function rowsOf(report: TaskReport): TagRow[] {
  const rows: TagRow[] = report.byTag.map((tag) => ({
    key: tag.tagId,
    name: tag.name,
    done: tag.done,
    color: tag.color,
  }));
  if (report.otherTagsDone > 0) {
    rows.push({ key: 'other', name: 'Other tags', done: report.otherTagsDone, color: null });
  }
  if (report.noTagDone > 0) {
    rows.push({ key: 'none', name: 'No tag', done: report.noTagDone, color: null });
  }
  return rows;
}

/** Done by tag: one hue of bars, the tag color only as a small dot. */
export function DoneByTagCard({ report }: { report: TaskReport }) {
  const [table, setTable] = useState(false);
  const rows = rowsOf(report);
  const max = Math.max(1, ...rows.map((row) => row.done));

  return (
    <ReportCard
      title="Done by tag"
      subtitle="A task counts once for each tag"
      table={table}
      onToggleTable={() => {
        setTable((value) => !value);
      }}
    >
      {table ? (
        <ReportTable
          label="Done by tag"
          head={['Tag', 'Done']}
          rows={rows.map((row) => [row.name, row.done])}
        />
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-body text-fg-muted">
          No tags yet this {periodWord(report.period)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 pt-1">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,96px)_1fr_24px] items-center gap-2 text-body"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-fg">
                <span
                  aria-hidden
                  className={
                    row.color === null
                      ? 'size-2 shrink-0 rounded-full border border-fg-muted'
                      : 'size-2 shrink-0 rounded-full'
                  }
                  style={row.color === null ? undefined : { backgroundColor: row.color }}
                />
                <span className="truncate">{row.name}</span>
              </span>
              <span aria-hidden className="h-3">
                <span
                  className="block h-3 rounded-r-[4px] bg-module-tasks"
                  style={{ width: `${String((row.done / max) * 100)}%` }}
                />
              </span>
              <span className="text-right text-small text-fg-secondary">{row.done}</span>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  );
}
